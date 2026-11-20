import { spawn, ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { cacheDir, dataDir } from "../paths";
import { getSetting, logEvent } from "../db";
import { redact } from "../secrets";

const PORT = 8100;
const IDLE_MS = 10 * 60 * 1000;

export interface VoiceOption {
  id: string;
  motor: "kokoro" | "piper" | "apple";
  voz: string;
  idioma: "es" | "en";
  nombre: string;
  genero: "masculina" | "femenina";
  descripcion: string;
  licencia: string;
  origen: string;
  nota?: string;
}

export const VOICES: VoiceOption[] = [
  {
    id: "kokoro-em_alex",
    motor: "kokoro",
    voz: "em_alex",
    idioma: "es",
    nombre: "Álex (Kokoro)",
    genero: "masculina",
    descripcion: "Masculina, tono medio-grave, dicción clara en español. La más natural en las pruebas.",
    licencia: "Apache-2.0 (Kokoro-82M)",
    origen: "kokoro-onnx · hexgrad/Kokoro",
  },
  {
    id: "kokoro-em_santa",
    motor: "kokoro",
    voz: "em_santa",
    idioma: "es",
    nombre: "Santa (Kokoro)",
    genero: "masculina",
    descripcion: "Masculina, algo más oscura y pausada. Alternativa a Álex.",
    licencia: "Apache-2.0 (Kokoro-82M)",
    origen: "kokoro-onnx · hexgrad/Kokoro",
  },
  {
    id: "piper-jarvis-es",
    motor: "piper",
    voz: "jarvis-high",
    idioma: "es",
    nombre: "JARVIS (Piper) en español",
    genero: "masculina",
    descripcion: "Voz JARVIS original. En español pronuncia con fonemas ingleses: no es utilizable.",
    licencia: "MIT (declarada por el autor)",
    origen: "huggingface.co/jgkawell/jarvis",
    nota: "Solo inglés. En español la inteligibilidad cae por debajo del 40 %.",
  },
  {
    id: "kokoro-bm_george",
    motor: "kokoro",
    voz: "bm_george",
    idioma: "en",
    nombre: "George (Kokoro, en-GB)",
    genero: "masculina",
    descripcion: "Británica, profunda y sobria. La más cercana al estilo mayordomo.",
    licencia: "Apache-2.0 (Kokoro-82M)",
    origen: "kokoro-onnx · hexgrad/Kokoro",
  },
  {
    id: "kokoro-bm_lewis",
    motor: "kokoro",
    voz: "bm_lewis",
    idioma: "en",
    nombre: "Lewis (Kokoro, en-GB)",
    genero: "masculina",
    descripcion: "Británica, más cálida y ligeramente más rápida.",
    licencia: "Apache-2.0 (Kokoro-82M)",
    origen: "kokoro-onnx · hexgrad/Kokoro",
  },
  {
    id: "kokoro-bm_fable",
    motor: "kokoro",
    voz: "bm_fable",
    idioma: "en",
    nombre: "Fable (Kokoro, en-GB)",
    genero: "masculina",
    descripcion: "Británica, narrador, con más color y expresividad.",
    licencia: "Apache-2.0 (Kokoro-82M)",
    origen: "kokoro-onnx · hexgrad/Kokoro",
  },
  {
    id: "piper-jarvis-en",
    motor: "piper",
    voz: "jarvis-high",
    idioma: "en",
    nombre: "JARVIS original (Piper, en-GB)",
    genero: "masculina",
    descripcion: "El modelo jgkawell/jarvis. Imitación muy lograda del JARVIS cinematográfico en inglés.",
    licencia: "MIT (declarada por el autor)",
    origen: "huggingface.co/jgkawell/jarvis",
  },
  {
    id: "apple-monica",
    motor: "apple",
    voz: "Mónica",
    idioma: "es",
    nombre: "Mónica (macOS)",
    genero: "femenina",
    descripcion: "Voz del sistema. Fallback si los motores locales no están disponibles.",
    licencia: "Sistema macOS",
    origen: "Voces del sistema macOS (say)",
  },
];

const globalForVoiceWorker = globalThis as unknown as {
  __paibVoiceWorker?: { proc: ChildProcess | null; lastUsed: number; timer: NodeJS.Timeout | null; starting: Promise<void> | null };
};

function state() {
  if (!globalForVoiceWorker.__paibVoiceWorker) {
    globalForVoiceWorker.__paibVoiceWorker = { proc: null, lastUsed: 0, timer: null, starting: null };
  }
  return globalForVoiceWorker.__paibVoiceWorker;
}

export function voicePaths() {
  const base = path.join(dataDir(), "voices");
  return {
    base,
    python: path.join(base, "venv-voice", "bin", "python"),
    script: path.join(process.cwd(), "scripts", "voice_worker.py"),
    kokoro: path.join(base, "kokoro"),
    piper: path.join(base, "piper"),
  };
}

export function workerAvailable(): { ok: boolean; detalle: string } {
  const p = voicePaths();
  if (!fs.existsSync(p.python)) return { ok: false, detalle: "Falta el entorno aislado (venv-voice)" };
  if (!fs.existsSync(p.script)) return { ok: false, detalle: "Falta scripts/voice_worker.py" };
  if (!fs.existsSync(path.join(p.kokoro, "kokoro-v1.0.onnx"))) return { ok: false, detalle: "Falta el modelo Kokoro" };
  return { ok: true, detalle: "Listo" };
}

async function healthy(): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/health`, { signal: AbortSignal.timeout(1200) });
    return res.ok;
  } catch {
    return false;
  }
}

async function ensureWorker(): Promise<void> {
  const s = state();
  if (await healthy()) {
    s.lastUsed = Date.now();
    scheduleIdleStop();
    return;
  }
  if (s.starting) return s.starting;
  logEvent("info", "voz", "Arrancando motor de voz");
  const info = workerAvailable();
  if (!info.ok) throw new Error(info.detalle);
  const p = voicePaths();

  s.starting = (async () => {
    const proc = spawn(
      p.python,
      [p.script, "--port", String(PORT), "--kokoro-dir", p.kokoro, "--piper-dir", p.piper],
      { stdio: ["ignore", "ignore", "pipe"] },
    );
    s.proc = proc;
    proc.stderr?.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      if (/error|traceback/i.test(text)) logEvent("warn", "voz", `worker: ${redact(text.slice(0, 300))}`);
    });
    proc.on("exit", () => {
      s.proc = null;
      s.starting = null;
    });
    const cleanup = () => {
      try {
        proc.kill();
      } catch {
        /* ya terminado */
      }
    };
    process.once("exit", cleanup);
    process.once("SIGTERM", cleanup);
    process.once("SIGINT", cleanup);

    for (let i = 0; i < 60; i++) {
      if (await healthy()) {
        logEvent("info", "voz", `Motor de voz listo en ${i * 250} ms`);
        return;
      }
      if (!s.proc) break;
      await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error("El motor de voz no arrancó");
  })();

  try {
    await s.starting;
    s.lastUsed = Date.now();
    scheduleIdleStop();
    logEvent("info", "voz", "Motor de voz local iniciado");
  } finally {
    s.starting = null;
  }
}

function scheduleIdleStop() {
  const s = state();
  if (s.timer) clearTimeout(s.timer);
  s.timer = setTimeout(() => {
    if (Date.now() - s.lastUsed >= IDLE_MS && s.proc) {
      logEvent("info", "voz", "Motor de voz detenido por inactividad");
      s.proc.kill();
      s.proc = null;
    }
  }, IDLE_MS + 5000);
  s.timer.unref?.();
}

export function stopVoiceWorker() {
  const s = state();
  if (s.proc) {
    s.proc.kill();
    s.proc = null;
  }
}

export async function workerStatus() {
  const info = workerAvailable();
  const s = state();
  let health: any = null;
  if (await healthy()) {
    try {
      health = await (await fetch(`http://127.0.0.1:${PORT}/health`, { signal: AbortSignal.timeout(1500) })).json();
    } catch {
      health = null;
    }
  }
  return {
    disponible: info.ok,
    detalle: info.detalle,
    activo: Boolean(s.proc) || Boolean(health),
    ...health,
  };
}

export function detectLang(text: string): "es" | "en" {
  const t = text.toLowerCase();
  const es = (t.match(/[áéíóúñ¿¡]/g)?.length ?? 0) * 2;
  const en = t.match(/\b(the|and|you|your|with|this|that|have|will|would|please|sir|good|evening)\b/g)?.length ?? 0;
  const esWords = t.match(/\b(el|la|los|las|que|de|para|con|una|por|está|están|puedo|buenas|gracias|señor)\b/g)?.length ?? 0;
  return es + esWords >= en ? "es" : "en";
}

export function resolveVoice(text: string): { motor: "kokoro" | "piper" | "apple"; voz: string; idioma: "es" | "en" } {
  const idioma = detectLang(text);
  if (idioma === "en") {
    const motor = (getSetting("motor_voz_en", "kokoro") || "kokoro") as "kokoro" | "piper" | "apple";
    return { motor, voz: getSetting("voz_en", motor === "piper" ? "jarvis-high" : "bm_george"), idioma };
  }
  const motor = (getSetting("motor_voz_es", "kokoro") || "kokoro") as "kokoro" | "piper" | "apple";
  return { motor, voz: getSetting("voz_es", "em_alex"), idioma };
}

export interface LocalSynthResult {
  file: string;
  mime: string;
  cached: boolean;
  ms: number;
  meta?: Record<string, unknown>;
}

export async function synthLocal(input: {
  text: string;
  motor: "kokoro" | "piper";
  voz: string;
  idioma: "es" | "en";
  velocidad?: number;
}): Promise<LocalSynthResult> {
  const started = Date.now();
  const hash = createHash("sha256")
    .update(`${input.motor}|${input.voz}|${input.idioma}|${input.velocidad ?? 1}|${input.text}`)
    .digest("hex")
    .slice(0, 24);
  const file = path.join(cacheDir(), "voz", `${hash}.wav`);
  if (fs.existsSync(file)) return { file, mime: "audio/wav", cached: true, ms: 0 };

  await ensureWorker();
  const s = state();
  s.lastUsed = Date.now();
  scheduleIdleStop();

  const tReq = Date.now();
  const res = await fetch(`http://127.0.0.1:${PORT}/synth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: input.text,
      engine: input.motor,
      voice: input.voz,
      lang: input.idioma,
      speed: input.velocidad ?? 1,
    }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Motor de voz: ${redact(detail.slice(0, 300))}`);
  }
  logEvent("info", "voz", `Síntesis HTTP en ${Date.now() - tReq} ms`);
  const metaHeader = res.headers.get("x-voice-meta");
  const buffer = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, buffer);
  return {
    file,
    mime: "audio/wav",
    cached: false,
    ms: Date.now() - started,
    meta: metaHeader ? JSON.parse(metaHeader) : undefined,
  };
}
