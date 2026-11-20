"use client";

import { useMemo, useRef, useState } from "react";
import { api, useApi } from "@/lib/client";
import { PageHeader, Spinner, Toast } from "@/components/ui";

interface Voz {
  id: string;
  motor: "kokoro" | "piper" | "apple";
  voz: string;
  idioma: "es" | "en";
  nombre: string;
  genero: string;
  descripcion: string;
  licencia: string;
  origen: string;
  nota?: string;
}

export default function VocesPage() {
  const { data, reload, loading } = useApi<{
    voces: Voz[];
    seleccion: Record<"es" | "en", { motor: string; voz: string }>;
    motor: { disponible: boolean; activo: boolean; engine?: string; rss_mb?: number; load_ms?: number; detalle?: string };
    disponible: boolean;
    detalle: string;
    piper_personalizadas: string[];
  }>("/api/voice/engines", 0);

  const [idioma, setIdioma] = useState<"es" | "en">("es");
  const [cargando, setCargando] = useState<string | null>(null);
  const [sonando, setSonando] = useState<string | null>(null);
  const [latencia, setLatencia] = useState<Record<string, number>>({});
  const [toast, setToast] = useState<{ msg: string; kind: "info" | "error" | "ok" } | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const notify = (msg: string, kind: "info" | "error" | "ok" = "info") => {
    setToast({ msg, kind });
    setTimeout(() => setToast(null), 4200);
  };

  const voces = useMemo(() => (data?.voces ?? []).filter((v) => v.idioma === idioma), [data, idioma]);
  const activa = data?.seleccion?.[idioma];

  const escuchar = async (voz: Voz) => {
    setCargando(voz.id);
    setSonando(null);
    audioRef.current?.pause();
    const t0 = performance.now();
    try {
      const res = await fetch("/api/voice/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ motor: voz.motor, voz: voz.voz, idioma: voz.idioma }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).error ?? `Error ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      setLatencia((l) => ({ ...l, [voz.id]: Math.round(performance.now() - t0) }));
      setSonando(voz.id);
      audio.onended = () => {
        setSonando(null);
        URL.revokeObjectURL(url);
      };
      await audio.play();
    } catch (err: any) {
      notify(err.message, "error");
    } finally {
      setCargando(null);
    }
  };

  const activar = async (voz: Voz) => {
    try {
      await api("/api/voice/selection", {
        method: "PUT",
        body: JSON.stringify({ idioma: voz.idioma, motor: voz.motor, voz: voz.voz }),
      });
      notify(`Voz activada para ${voz.idioma === "es" ? "español" : "inglés"}: ${voz.nombre}`, "ok");
      await reload();
    } catch (err: any) {
      notify(err.message, "error");
    }
  };

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-6 sm:px-7">
      <PageHeader
        title="Voces"
        subtitle="Compara y elige la voz de JARVIS. Todo se sintetiza en tu Mac; ninguna muestra sale del equipo."
        actions={
          <div className="flex rounded-xl border border-white/8 bg-white/[0.02] p-0.5">
            {(["es", "en"] as const).map((l) => (
              <button
                key={l}
                onClick={() => setIdioma(l)}
                className={`rounded-lg px-3 py-1.5 text-xs uppercase transition ${
                  idioma === l ? "bg-white/[0.08] text-white" : "text-mist-400 hover:text-mist-200"
                }`}
              >
                {l === "es" ? "Español" : "Inglés"}
              </button>
            ))}
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-white/6 bg-white/[0.02] px-4 py-3 text-xs text-mist-400">
        <span className={`node-dot ${data?.disponible ? "bg-emerald-400" : "bg-amber-400"}`} />
        <span>{data?.disponible ? "Motor local listo" : data?.detalle ?? "Comprobando…"}</span>
        {data?.motor?.activo && (
          <span className="chip">
            cargado: {data.motor.engine ?? "—"} · {data.motor.rss_mb ?? "—"} MB
          </span>
        )}
        <span className="chip">Kokoro: Apache-2.0 · Piper JARVIS: MIT declarada</span>
        <a href="/asistente" className="ml-auto text-neon-400 hover:underline">
          Probar en JARVIS
        </a>
      </div>

      {loading && !data && (
        <div className="flex items-center gap-2 text-mist-400">
          <Spinner /> Cargando voces…
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {voces.map((voz) => {
          const esActiva = activa?.motor === voz.motor && activa?.voz === voz.voz;
          return (
            <div key={voz.id} className={`card p-4 ${esActiva ? "border-neon-500/35 bg-neon-500/[0.04]" : ""}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-mist-100">{voz.nombre}</span>
                    {esActiva && <span className="chip border-neon-500/30 text-neon-400">activa</span>}
                  </div>
                  <div className="mt-0.5 text-[10px] uppercase tracking-wider text-mist-400">
                    {voz.motor} · {voz.genero}
                  </div>
                </div>
                <span className="chip font-mono text-[10px]">{voz.idioma}</span>
              </div>

              <p className="mt-2 text-xs leading-relaxed text-mist-400">{voz.descripcion}</p>
              {voz.nota && <p className="mt-1 text-[10px] text-amber-300/80">{voz.nota}</p>}

              <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]">
                <span className="chip">{voz.licencia}</span>
                {latencia[voz.id] ? <span className="chip">{latencia[voz.id]} ms</span> : null}
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button className="btn-ghost text-xs" onClick={() => void escuchar(voz)} disabled={cargando === voz.id}>
                  {cargando === voz.id ? <Spinner /> : sonando === voz.id ? "Reproduciendo…" : "Escuchar muestra"}
                </button>
                <button className="btn-primary text-xs" onClick={() => void activar(voz)} disabled={esActiva}>
                  {esActiva ? "En uso" : `Activar en ${voz.idioma === "es" ? "español" : "inglés"}`}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <section className="card mt-5 p-5">
        <h2 className="h2 mb-2">Sobre la voz JARVIS original</h2>
        <p className="text-xs leading-relaxed text-mist-400">
          <span className="text-mist-200">jgkawell/jarvis</span> es un modelo Piper (ONNX, 22 kHz) afinado sobre
          <span className="text-mist-200"> en_GB</span> con fonemas <span className="font-mono">en-gb-x-rp</span>.
          En inglés suena muy cercano al JARVIS cinematográfico. En español no puede cambiar de fonemizador: lee el texto
          con reglas inglesas y la inteligibilidad se desploma (la transcripción automática devuelve “UNAS Notches… en 4”
          en lugar de “Buenas noches…”). Por eso se ofrece para inglés y no se activa en español.
        </p>
        <p className="mt-2 text-[11px] text-mist-400">
          Procedencia: 460 clips del corpus interno “caged” (frases de asistente: “Very good, sir”), no audio de las
          películas. Licencia declarada MIT por el autor. La identidad sonora imita a un personaje de ficción: para uso
          personal es razonable; para uso comercial habría que revisar derechos de voz e imagen.
        </p>
      </section>

      <section className="card mt-4 p-5">
        <h2 className="h2 mb-2">Voces personalizadas (opcional)</h2>
        <p className="text-xs leading-relaxed text-mist-400">
          Si creas una voz propia con VoiceStudio u otra herramienta Piper, copia el par
          <span className="font-mono"> .onnx</span> y <span className="font-mono">.onnx.json</span> en
          <span className="font-mono"> ~/Library/Application Support/PersonalAIBrain/voices/piper/&lt;nombre&gt;/</span>.
          La carpeta se detecta automáticamente.
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {(data?.piper_personalizadas ?? []).map((v) => (
            <span key={v} className="chip font-mono text-[10px]">
              {v}
            </span>
          ))}
          {(data?.piper_personalizadas ?? []).length === 0 && <span className="text-[11px] text-mist-400">Ninguna todavía.</span>}
        </div>
      </section>

      <section className="card mt-4 p-5">
        <h2 className="h2 mb-2">Mediciones en este Mac (M4, 16 GB)</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[11px]">
            <thead className="text-mist-400">
              <tr>
                <th className="py-1.5 pr-4 font-medium">Motor</th>
                <th className="py-1.5 pr-4 font-medium">Modelo</th>
                <th className="py-1.5 pr-4 font-medium">Síntesis (frase de 3 s)</th>
                <th className="py-1.5 pr-4 font-medium">RAM</th>
                <th className="py-1.5 font-medium">Español</th>
              </tr>
            </thead>
            <tbody className="text-mist-300">
              <tr className="border-t border-white/5">
                <td className="py-1.5 pr-4">Kokoro</td>
                <td className="py-1.5 pr-4">310 MB ONNX</td>
                <td className="py-1.5 pr-4">1,6 – 1,7 s</td>
                <td className="py-1.5 pr-4">~560 MB</td>
                <td className="py-1.5 text-emerald-300">Correcto</td>
              </tr>
              <tr className="border-t border-white/5">
                <td className="py-1.5 pr-4">Piper JARVIS</td>
                <td className="py-1.5 pr-4">109 MB ONNX</td>
                <td className="py-1.5 pr-4">1,5 – 1,7 s</td>
                <td className="py-1.5 pr-4">~540 MB</td>
                <td className="py-1.5 text-red-300">No utilizable</td>
              </tr>
              <tr className="border-t border-white/5">
                <td className="py-1.5 pr-4">Voces de macOS</td>
                <td className="py-1.5 pr-4">sistema</td>
                <td className="py-1.5 pr-4">1,3 – 1,9 s</td>
                <td className="py-1.5 pr-4">&lt;100 MB</td>
                <td className="py-1.5 text-emerald-300">Correcto</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[10px] text-mist-400">
          El motor se descarga solo tras 10 minutos sin uso. Solo hay un motor cargado a la vez.
        </p>
      </section>

      {toast && <Toast message={toast.msg} kind={toast.kind} onDone={() => setToast(null)} />}
    </div>
  );
}
