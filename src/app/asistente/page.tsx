"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, formatDate, useApi } from "@/lib/client";
import { Spinner, Toast } from "@/components/ui";

type Estado = "inactivo" | "escuchando" | "transcribiendo" | "pensando" | "hablando";

interface Citation {
  n: number;
  doc_id: string;
  doc_name: string;
  page: number | null;
}

interface ToolTrace {
  herramienta: string;
  argumentos: Record<string, unknown>;
  ok: boolean;
  resumen: string;
  artefactos?: Array<{ id: string; name: string; url: string }>;
  duracion_ms?: number;
}

interface PendingAction {
  herramienta: string;
  argumentos: Record<string, unknown>;
  resumen: string;
}

interface Msg {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: { sources?: Citation[]; tools?: ToolTrace[]; pending?: PendingAction | null };
  created_at: string;
}

interface VoiceInfo {
  disponible: boolean;
  stt: { cargado: boolean; modelo: string; detalle: string };
  voces: Array<{ nombre: string; idioma: string }>;
  voz_actual: string;
  velocidad: number;
  volumen: number;
  palabra_activacion: string;
  manos_libres: boolean;
  auto_tts: boolean;
}

export default function AsistentePage() {
  const { data: voice, reload: reloadVoice } = useApi<VoiceInfo>("/api/voice/transcribe", 0);
  const [estado, setEstado] = useState<Estado>("inactivo");
  const [nivel, setNivel] = useState(0);
  const [parcial, setParcial] = useState("");
  const [mensajes, setMensajes] = useState<Msg[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [manosLibres, setManosLibres] = useState(false);
  const [autoTts, setAutoTts] = useState(true);
  const [voz, setVoz] = useState("Mónica");
  const [velocidad, setVelocidad] = useState(185);
  const [volumen, setVolumen] = useState(0.9);
  const [palabra, setPalabra] = useState("jarvis");
  const [toast, setToast] = useState<{ msg: string; kind: "info" | "error" | "ok" } | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [metricas, setMetricas] = useState<{ stt?: number; total?: number; primera_voz?: number }>({});
  const [ignorado, setIgnorado] = useState<string | null>(null);
  const [textoManual, setTextoManual] = useState("");

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const speakingRef = useRef(false);
  const estadoRef = useRef<Estado>("inactivo");
  const manosLibresRef = useRef(false);
  const autoTtsRef = useRef(true);
  const palabraRef = useRef("jarvis");
  const conversationRef = useRef<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const speechStartRef = useRef(0);
  const silenceSinceRef = useRef(0);
  const gotSpeechRef = useRef(false);
  const restartTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const stopRequestedRef = useRef(false);

  const setEstadoBoth = (value: Estado) => {
    estadoRef.current = value;
    setEstado(value);
  };

  const notify = (msg: string, kind: "info" | "error" | "ok" = "info") => {
    setToast({ msg, kind });
    setTimeout(() => setToast(null), 4500);
  };

  useEffect(() => {
    if (!voice) return;
    if (voice.auto_tts) {
      fetch("/api/voice/warm", { method: "POST" }).catch(() => {});
    }
    setManosLibres(voice.manos_libres);
    setAutoTts(voice.auto_tts);
    setVoz(voice.voz_actual);
    setVelocidad(voice.velocidad);
    setVolumen(voice.volumen);
    setPalabra(voice.palabra_activacion);
    manosLibresRef.current = voice.manos_libres;
    autoTtsRef.current = voice.auto_tts;
    palabraRef.current = voice.palabra_activacion;
  }, [voice]);

  useEffect(() => {
    return () => {
      stopEverything();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveSetting = async (patch: Record<string, string>) => {
    try {
      await api("/api/settings", { method: "PUT", body: JSON.stringify(patch) });
    } catch (err: any) {
      notify(err.message, "error");
    }
  };

  const stopEverything = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    recorderRef.current?.state === "recording" && recorderRef.current.stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    audioRef.current?.pause();
    speakingRef.current = false;
    if (restartTimer.current) clearTimeout(restartTimer.current);
    setNivel(0);
    setEstadoBoth("inactivo");
  };

  const speak = useCallback(
    async (text: string) => {
      if (!text.trim()) return;
      const t0 = performance.now();
      speakingRef.current = true;
      setEstadoBoth("hablando");
      try {
        const { segments } = await api<{ segments: string[] }>("/api/voice/speak", {
          method: "POST",
          body: JSON.stringify({ text, segments: true }),
        });
        let first = true;
        for (const segment of segments) {
          if (!speakingRef.current) break;
          const res = await fetch("/api/voice/speak", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: segment, voice: voz, rate: velocidad }),
          });
          if (!res.ok) throw new Error("No se pudo sintetizar la voz");
          const blob = await res.blob();
          if (!speakingRef.current) break;
          const url = URL.createObjectURL(blob);
          const audio = new Audio(url);
          audio.volume = volumen;
          audioRef.current = audio;
          await new Promise<void>((resolve) => {
            audio.onended = () => resolve();
            audio.onerror = () => resolve();
            void audio.play().catch(() => resolve());
          });
          URL.revokeObjectURL(url);
          if (first) {
            first = false;
            setMetricas((m) => ({ ...m, primera_voz: Math.round(performance.now() - t0) }));
          }
        }
      } catch (err: any) {
        notify(err.message, "error");
      } finally {
        speakingRef.current = false;
        if (estadoRef.current === "hablando") setEstadoBoth("inactivo");
        if (manosLibresRef.current && !restartTimer.current) {
          restartTimer.current = setTimeout(() => {
            restartTimer.current = null;
            if (manosLibresRef.current && !speakingRef.current) void startListening(true);
          }, 500);
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [voz, velocidad, volumen],
  );

  const ask = useCallback(
    async (question: string, origen: "texto" | "voz") => {
      if (!question.trim()) return;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setMensajes((prev) => [
        ...prev,
        { id: `tmp-${Date.now()}`, role: "user", content: question, created_at: new Date().toISOString() },
      ]);
      setEstadoBoth("pensando");
      setParcial("");
      const t0 = performance.now();
      try {
        const result = await api<any>("/api/assistant", {
          method: "POST",
          body: JSON.stringify({ question, conversation_id: conversationRef.current, origin: origen }),
          signal: controller.signal,
        });
        conversationRef.current = result.conversation_id;
        setConversationId(result.conversation_id);
        setMetricas((m) => ({ ...m, total: Math.round(performance.now() - t0) }));
        setMensajes((prev) => [
          ...prev,
          {
            id: result.message_id,
            role: "assistant",
            content: result.answer,
            citations: { sources: result.sources, tools: result.tools, pending: result.pending },
            created_at: new Date().toISOString(),
          },
        ]);
        setPending(result.pending ?? null);
        setEstadoBoth("inactivo");
        if (autoTtsRef.current && result.answer) void speak(result.answer);
        else if (manosLibresRef.current) {
          setTimeout(() => {
            if (manosLibresRef.current && !speakingRef.current) void startListening(true);
          }, 400);
        }
      } catch (err: any) {
        if (err?.name === "AbortError") {
          setEstadoBoth("inactivo");
          return;
        }
        setMensajes((prev) => [
          ...prev,
          { id: `err-${Date.now()}`, role: "assistant", content: `⚠️ ${err.message}`, created_at: new Date().toISOString() },
        ]);
        setEstadoBoth("inactivo");
        notify(err.message, "error");
      }
    },
    [speak],
  );

  const stopListening = useCallback(
    (send: boolean) => {
      const recorder = recorderRef.current;
      if (!recorder || recorder.state !== "recording") return;
      stopRequestedRef.current = !send;
      recorder.stop();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      setNivel(0);
    },
    [],
  );

  const transcribeBlob = useCallback(
    async (blob: Blob) => {
      setEstadoBoth("transcribiendo");
      const t0 = performance.now();
      try {
        const form = new FormData();
        const ext = blob.type.includes("mp4") ? "m4a" : blob.type.includes("ogg") ? "ogg" : "webm";
        form.append("audio", blob, `voz.${ext}`);
        const result = await api<{ text: string; ms: number }>("/api/voice/transcribe", { method: "POST", body: form });
        setMetricas((m) => ({ ...m, stt: Math.round(performance.now() - t0) }));
        const text = result.text.trim();
        if (!text) {
          setEstadoBoth("inactivo");
          if (manosLibresRef.current) void startListening(true);
          return;
        }
        const normalized = text.toLowerCase().replace(/[.,;:¡!¿?]/g, " ").replace(/\s+/g, " ").trim();
        const wake = palabraRef.current.toLowerCase();
        const tokens = normalized.split(" ").filter(Boolean);
        const fuzzy = (a: string, b: string) => {
          if (Math.abs(a.length - b.length) > 2) return false;
          const dp = Array.from({ length: b.length + 1 }, (_, i) => [i]);
          for (let j = 1; j <= a.length; j++) dp[0][j] = j;
          for (let i = 1; i <= b.length; i++) {
            for (let j = 1; j <= a.length; j++) {
              dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[j - 1] === b[i - 1] ? 0 : 1));
            }
          }
          return dp[b.length][a.length] <= 2;
        };
        const wakeOk = normalized.includes(wake) || tokens.slice(0, 3).some((t) => fuzzy(t, wake));
        if (manosLibresRef.current && !wakeOk) {
          setIgnorado(text);
          setTimeout(() => setIgnorado(null), 2500);
          setEstadoBoth("inactivo");
          void startListening(true);
          return;
        }
        const clean = normalized.includes(wake) ? text.replace(new RegExp(wake, "i"), "").replace(/^[,.\s]+/, "").trim() || text : text;
        setParcial(clean);
        await ask(clean, "voz");
      } catch (err: any) {
        notify(err.message, "error");
        setEstadoBoth("inactivo");
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ask],
  );

  const startListening = useCallback(
    async (auto = false) => {
      if (speakingRef.current || estadoRef.current === "escuchando" || estadoRef.current === "pensando") return;
      try {
        if (!streamRef.current) {
          streamRef.current = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          });
        }
        const stream = streamRef.current;
        if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
        if (audioCtxRef.current.state === "suspended") await audioCtxRef.current.resume();
        const source = audioCtxRef.current.createMediaStreamSource(stream);
        const analyser = audioCtxRef.current.createAnalyser();
        analyser.fftSize = 1024;
        source.connect(analyser);
        analyserRef.current = analyser;

        const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : MediaRecorder.isTypeSupported("audio/mp4")
            ? "audio/mp4"
            : "";
        const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
        chunksRef.current = [];
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data);
        };
        recorder.onstop = () => {
          const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
          chunksRef.current = [];
          if (stopRequestedRef.current) {
            stopRequestedRef.current = false;
            setEstadoBoth("inactivo");
            return;
          }
          if (blob.size < 1200) {
            setEstadoBoth("inactivo");
            if (manosLibresRef.current) void startListening(true);
            return;
          }
          void transcribeBlob(blob);
        };
        recorderRef.current = recorder;
        recorder.start();
        gotSpeechRef.current = false;
        speechStartRef.current = 0;
        silenceSinceRef.current = 0;
        setEstadoBoth("escuchando");

        const data = new Uint8Array(analyser.fftSize);
        const tick = () => {
          if (recorder.state !== "recording") return;
          analyser.getByteTimeDomainData(data);
          let sum = 0;
          for (let i = 0; i < data.length; i++) {
            const v = (data[i] - 128) / 128;
            sum += v * v;
          }
          const rms = Math.sqrt(sum / data.length);
          setNivel(Math.min(1, rms * 4));
          const now = performance.now();
          if (rms > 0.02) {
            if (!gotSpeechRef.current) {
              gotSpeechRef.current = true;
              speechStartRef.current = now;
            }
            silenceSinceRef.current = 0;
          } else if (gotSpeechRef.current) {
            if (!silenceSinceRef.current) silenceSinceRef.current = now;
            const silenceMs = now - silenceSinceRef.current;
            const speechMs = now - speechStartRef.current;
            if (silenceMs > (auto ? Number((voice as any)?.silencio_ms ?? 1100) : 1400) && speechMs > 400) {
              stopListening(true);
              return;
            }
          }
          if (now - speechStartRef.current > 45_000) {
            stopListening(true);
            return;
          }
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      } catch (err: any) {
        const message =
          err?.name === "NotAllowedError"
            ? "Permiso de micrófono denegado. Actívalo en Ajustes del Sistema → Privacidad y seguridad → Micrófono."
            : err?.message ?? "No se pudo acceder al micrófono";
        notify(message, "error");
        setEstadoBoth("inactivo");
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stopListening, transcribeBlob],
  );

  const toggleMic = () => {
    if (estadoRef.current === "escuchando") stopListening(true);
    else if (estadoRef.current === "hablando") {
      speakingRef.current = false;
      audioRef.current?.pause();
      setEstadoBoth("inactivo");
    } else void startListening(false);
  };

  const interrupt = () => {
    abortRef.current?.abort();
    speakingRef.current = false;
    audioRef.current?.pause();
    audioRef.current = null;
    setEstadoBoth("inactivo");
    if (manosLibresRef.current) void startListening(true);
  };

  const confirmPending = async () => {
    if (!pending || !conversationRef.current) return;
    try {
      const result = await api<{ resumen: string }>("/api/assistant/confirm", {
        method: "POST",
        body: JSON.stringify({
          conversation_id: conversationRef.current,
          herramienta: pending.herramienta,
          argumentos: pending.argumentos,
        }),
      });
      setMensajes((prev) => [
        ...prev,
        { id: `conf-${Date.now()}`, role: "assistant", content: result.resumen, created_at: new Date().toISOString() },
      ]);
      setPending(null);
      if (autoTtsRef.current) void speak(result.resumen);
    } catch (err: any) {
      notify(err.message, "error");
    }
  };

  const nuevaConversacion = () => {
    conversationRef.current = null;
    setConversationId(null);
    setMensajes([]);
    setPending(null);
    setParcial("");
  };

  const cargarConversacion = async (id: string) => {
    try {
      const data = await api<{ messages: Msg[] }>(`/api/conversations/${id}`);
      conversationRef.current = id;
      setConversationId(id);
      setMensajes(
        data.messages.map((m) => ({
          ...m,
          citations: typeof (m as any).citations === "string" ? JSON.parse((m as any).citations) : (m as any).citations,
        })),
      );
    } catch (err: any) {
      notify(err.message, "error");
    }
  };

  const { data: convs } = useApi<{ conversations: Array<{ id: string; title: string; updated_at: string }> }>(
    "/api/conversations",
    20000,
  );

  const escuchando = estado === "escuchando";

  return (
    <div className="mx-auto flex min-h-full max-w-[1100px] flex-col px-4 py-5 sm:px-7">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="h1 flex items-center gap-2">
            JARVIS
            <span className={`node-dot ${voice?.disponible ? "bg-neon-500" : "bg-amber-400"}`} />
          </h1>
          <p className="mt-1 text-sm text-mist-400">
            Habla o escribe. Voz local (whisper.cpp) y respuestas con la voz de macOS.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-ghost text-xs" onClick={nuevaConversacion}>
            Nueva conversación
          </button>
          <select
            className="input w-auto py-2 text-xs"
            value={conversationId ?? ""}
            onChange={(e) => (e.target.value ? void cargarConversacion(e.target.value) : nuevaConversacion())}
          >
            <option value="">Conversación actual</option>
            {(convs?.conversations ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </div>
      </header>

      {!voice?.disponible && (
        <div className="mb-4 rounded-xl border border-amber-500/25 bg-amber-500/5 px-4 py-3 text-xs text-amber-200">
          El reconocimiento de voz no está listo: {voice?.stt?.detalle ?? "comprobando…"}. Puedes seguir escribiendo.
        </div>
      )}

      <div className="grid flex-1 gap-4 lg:grid-cols-[340px_1fr]">
        <section className="card flex flex-col items-center justify-center p-5">
          <button
            onClick={toggleMic}
            className={`relative flex h-40 w-40 items-center justify-center rounded-full transition ${
              escuchando
                ? "bg-neon-500/15 ring-2 ring-neon-500/60"
                : estado === "hablando"
                  ? "bg-violet-500/15 ring-2 ring-violet-500/50"
                  : "bg-white/[0.04] ring-1 ring-white/10 hover:ring-neon-500/40"
            }`}
            aria-label={escuchando ? "Detener y enviar" : "Hablar"}
          >
            <span
              className="absolute inset-3 rounded-full bg-gradient-to-br from-neon-500/30 to-violet-500/30 transition-transform"
              style={{ transform: `scale(${0.75 + nivel * 0.45})`, opacity: escuchando ? 0.9 : 0.45 }}
            />
            <svg viewBox="0 0 24 24" className="relative h-12 w-12 text-white" fill="none" stroke="currentColor" strokeWidth="1.6">
              {estado === "hablando" ? (
                <path d="M7 7h3v10H7zM14 7h3v10h-3z" strokeLinejoin="round" />
              ) : (
                <>
                  <rect x="9" y="3" width="6" height="11" rx="3" />
                  <path d="M5 11a7 7 0 0 0 14 0M12 18v3" strokeLinecap="round" />
                </>
              )}
            </svg>
          </button>

          <div className="mt-4 h-6 text-sm text-mist-300">
            {estado === "inactivo" && "Pulsa el micrófono para hablar"}
            {estado === "escuchando" && "Escuchando… habla con naturalidad"}
            {estado === "transcribiendo" && <span className="flex items-center gap-2"><Spinner /> Transcribiendo</span>}
            {estado === "pensando" && <span className="flex items-center gap-2"><Spinner /> Pensando</span>}
            {estado === "hablando" && "Respondiendo… pulsa para interrumpir"}
          </div>

          {ignorado && <div className="mt-2 rounded-lg bg-white/5 px-2 py-1 text-[10px] text-mist-400">Ignorado: “{ignorado}”</div>}

          <div className="mt-5 grid w-full grid-cols-2 gap-2 text-[11px]">
            <label className="flex items-center gap-2 rounded-lg border border-white/8 px-2.5 py-2">
              <input
                type="checkbox"
                className="h-3.5 w-3.5 accent-[#35e0c4]"
                checked={manosLibres}
                onChange={(e) => {
                  setManosLibres(e.target.checked);
                  manosLibresRef.current = e.target.checked;
                  void saveSetting({ modo_manos_libres: String(e.target.checked) });
                  if (e.target.checked) void startListening(true);
                  else stopListening(false);
                }}
              />
              Manos libres
            </label>
            <label className="flex items-center gap-2 rounded-lg border border-white/8 px-2.5 py-2">
              <input
                type="checkbox"
                className="h-3.5 w-3.5 accent-[#35e0c4]"
                checked={autoTts}
                onChange={(e) => {
                  setAutoTts(e.target.checked);
                  autoTtsRef.current = e.target.checked;
                  void saveSetting({ auto_tts: String(e.target.checked) });
                }}
              />
              Responder en voz
            </label>
          </div>

          <div className="mt-3 w-full space-y-2 text-[11px]">
            <div>
              <label className="label mb-1">Voz</label>
              <a href="/voces" className="input flex items-center justify-between py-1.5 text-xs">
                <span className="truncate">
                  {(voice as any)?.voz_es ?? "em_alex"} · {(voice as any)?.motor_voz_es ?? "kokoro"}
                </span>
                <span className="text-neon-400">cambiar</span>
              </a>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-16 text-mist-400">Velocidad</span>
              <input
                type="range"
                min={120}
                max={260}
                value={velocidad}
                className="flex-1 accent-[#35e0c4]"
                onChange={(e) => setVelocidad(Number(e.target.value))}
                onMouseUp={() => void saveSetting({ voz_velocidad: String(velocidad) })}
                onTouchEnd={() => void saveSetting({ voz_velocidad: String(velocidad) })}
              />
              <span className="w-8 text-right text-mist-400">{velocidad}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-16 text-mist-400">Volumen</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={volumen}
                className="flex-1 accent-[#35e0c4]"
                onChange={(e) => setVolumen(Number(e.target.value))}
                onMouseUp={() => void saveSetting({ voz_volumen: String(volumen) })}
                onTouchEnd={() => void saveSetting({ voz_volumen: String(volumen) })}
              />
              <span className="w-8 text-right text-mist-400">{Math.round(volumen * 100)}</span>
            </div>
            <div>
              <label className="label mb-1">Palabra de activación</label>
              <input
                className="input py-1.5 text-xs"
                value={palabra}
                onChange={(e) => setPalabra(e.target.value)}
                onBlur={() => {
                  palabraRef.current = palabra || "jarvis";
                  void saveSetting({ palabra_activacion: palabra || "jarvis" });
                }}
              />
            </div>
          </div>

          <div className="mt-3 w-full rounded-lg bg-ink-950/50 p-2 font-mono text-[10px] text-mist-400">
            <div>STT: {metricas.stt ? `${metricas.stt} ms` : "—"} · Total: {metricas.total ? `${metricas.total} ms` : "—"}</div>
            <div>Primera voz: {metricas.primera_voz ? `${metricas.primera_voz} ms` : "—"}</div>
            <div>whisper: {voice?.stt?.cargado ? "cargado" : "en espera"} · {voice?.stt?.modelo}</div>
          </div>
        </section>

        <section className="flex min-h-0 flex-col">
          <div className="card flex-1 overflow-y-auto p-4" style={{ maxHeight: "62vh" }}>
            {mensajes.length === 0 && (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
                <div className="text-sm text-mist-200">Buenas. Soy JARVIS.</div>
                <p className="max-w-sm text-xs text-mist-400">
                  Puedo consultar tu memoria, tu agenda, crear documentos y avisarte. Prueba: “JARVIS, crea una
                  presentación de mis próximas vacaciones” o “¿qué sé sobre el Proyecto Aurora?”.
                </p>
              </div>
            )}
            <div className="space-y-3">
              {mensajes.map((m) => (
                <div key={m.id} className={m.role === "user" ? "flex justify-end" : ""}>
                  {m.role === "user" ? (
                    <div className="max-w-[85%] rounded-2xl rounded-br-md bg-neon-500/12 px-3.5 py-2 text-sm text-mist-100 ring-1 ring-neon-500/20">
                      {m.content}
                    </div>
                  ) : (
                    <div className="max-w-full">
                      <div className="rounded-2xl rounded-bl-md border border-white/6 bg-white/[0.025] px-3.5 py-2.5">
                        <div className="whitespace-pre-wrap text-sm leading-relaxed text-mist-200">{m.content}</div>
                        {m.citations?.tools && m.citations.tools.length > 0 && (
                          <div className="mt-2 space-y-1 border-t border-white/6 pt-2">
                            {m.citations.tools.map((t, i) => (
                              <div key={i} className="flex flex-wrap items-center gap-1.5 text-[10px] text-mist-400">
                                <span className={`node-dot ${t.ok ? "bg-emerald-400" : "bg-red-400"}`} />
                                <span className="font-mono text-mist-300">{t.herramienta}</span>
                                <span>· {t.resumen.slice(0, 120)}</span>
                                {t.duracion_ms ? <span>· {t.duracion_ms} ms</span> : null}
                                {t.artefactos?.map((a) => (
                                  <a key={a.id} href={a.url} target="_blank" rel="noreferrer" className="chip hover:text-white">
                                    {a.name}
                                  </a>
                                ))}
                              </div>
                            ))}
                          </div>
                        )}
                        {m.citations?.sources && m.citations.sources.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {m.citations.sources.map((s) => (
                              <a
                                key={`${m.id}-${s.n}`}
                                href={`/api/documents/${s.doc_id}/file${s.page ? `#page=${s.page}` : ""}`}
                                target="_blank"
                                rel="noreferrer"
                                className="chip hover:border-neon-500/40 hover:text-white"
                              >
                                <span className="font-mono text-neon-400">[{s.n}]</span>
                                <span className="max-w-[180px] truncate">{s.doc_name}</span>
                                {s.page && <span className="text-mist-400">p.{s.page}</span>}
                              </a>
                            ))}
                          </div>
                        )}
                        <div className="mt-2 flex items-center gap-2">
                          <button className="text-[10px] text-mist-400 hover:text-white" onClick={() => void speak(m.content)}>
                            Repetir en voz
                          </button>
                          <button
                            className="text-[10px] text-mist-400 hover:text-white"
                            onClick={() => void ask(`Explícame con más detalle: ${m.content.slice(0, 400)}`, "texto")}
                          >
                            Explicar más
                          </button>
                          <a
                            className="text-[10px] text-mist-400 hover:text-white"
                            href={`/cerebro?q=${encodeURIComponent((m.citations?.sources?.[0]?.doc_name ?? m.content).split(" ").slice(0, 2).join(" "))}`}
                          >
                            Ver en el cerebro
                          </a>
                          <span className="text-[10px] text-mist-500">{formatDate(m.created_at)}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {parcial && <div className="text-xs italic text-mist-400">“{parcial}”</div>}
              {estado === "pensando" && (
                <div className="flex items-center gap-2 text-xs text-mist-400">
                  <Spinner /> Consultando modelos y herramientas…
                </div>
              )}
            </div>
          </div>

          {pending && (
            <div className="card mt-3 border-amber-500/30 bg-amber-500/5 p-3">
              <div className="text-xs text-amber-200">
                Acción pendiente: <span className="font-mono">{pending.herramienta}</span> — {pending.resumen}
              </div>
              <pre className="mt-1 max-h-24 overflow-auto rounded bg-ink-950/60 p-2 font-mono text-[10px] text-mist-400">
                {JSON.stringify(pending.argumentos, null, 2)}
              </pre>
              <div className="mt-2 flex gap-2">
                <button className="btn-primary text-xs" onClick={() => void confirmPending()}>
                  Confirmar y ejecutar
                </button>
                <button className="btn-ghost text-xs" onClick={() => setPending(null)}>
                  Cancelar
                </button>
              </div>
            </div>
          )}

          <div className="mt-3 flex items-end gap-2">
            <textarea
              className="input max-h-32 min-h-[44px] resize-y py-2.5"
              rows={1}
              placeholder="Escribe a JARVIS… (Enter para enviar)"
              value={textoManual}
              onChange={(e) => setTextoManual(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  const q = textoManual.trim();
                  if (!q) return;
                  setTextoManual("");
                  void ask(q, "texto");
                }
              }}
            />
            <button
              className="btn-primary h-[44px] px-3"
              disabled={!textoManual.trim() || estado === "pensando"}
              onClick={() => {
                const q = textoManual.trim();
                if (!q) return;
                setTextoManual("");
                void ask(q, "texto");
              }}
            >
              Enviar
            </button>
            {(estado === "hablando" || estado === "pensando") && (
              <button className="btn-ghost h-[44px] px-3 text-xs" onClick={interrupt}>
                Detener
              </button>
            )}
          </div>
        </section>
      </div>

      {toast && <Toast message={toast.msg} kind={toast.kind} onDone={() => setToast(null)} />}
    </div>
  );
}
