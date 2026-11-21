import { spawn, ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { dataDir } from "../paths";
import { getSetting, logEvent } from "../db";
import { redact } from "../secrets";
import { transcribeParakeet } from "./engines";

const IDLE_MS = 10 * 60 * 1000;
const PORTS = { conversacion: 8099, preciso: 8097 } as const;
export type SttModo = keyof typeof PORTS;

interface Manager {
  port: number;
  proc: ChildProcess | null;
  starting: Promise<void> | null;
  lastUsed: number;
  timer: NodeJS.Timeout | null;
  lastError: string | null;
  signature: string;
}

const globalForVoice = globalThis as unknown as { __paibWhisper?: Record<string, Manager> };

function managers(): Record<string, Manager> {
  if (!globalForVoice.__paibWhisper) globalForVoice.__paibWhisper = {};
  return globalForVoice.__paibWhisper;
}

function manager(modo: SttModo): Manager {
  const key = modo;
  const store = managers();
  if (!store[key]) {
    store[key] = {
      port: PORTS[modo],
      proc: null,
      starting: null,
      lastUsed: 0,
      timer: null,
      lastError: null,
      signature: "",
    };
  }
  return store[key];
}

function modelExists(file: string): boolean {
  return Boolean(file) && fs.existsSync(file);
}

export function modelsDir(): string {
  return path.join(dataDir(), "models");
}

export function sttPrompt(): string {
  return (
    getSetting(
      "stt_prompt",
      "Conversación en español con Edu Canchi. Nombres frecuentes: Laura Méndez, Guatemala, proyecto Aurora, comité financiero.",
    ) || ""
  ).slice(0, 400);
}

/** Modelo rápido: prioriza latencia (small). */
export function fastModel(): string {
  const explicit = getSetting("stt_modelo_rapido", "");
  if (modelExists(explicit)) return explicit;
  const small = path.join(modelsDir(), "ggml-small.bin");
  return small;
}

/** Modelo preciso: el configurado por el usuario (large-turbo/medium) o medium si existe. */
export function accurateModel(): string {
  const explicit = getSetting("modelo_stt_ruta", "");
  if (modelExists(explicit)) return explicit;
  const medium = path.join(modelsDir(), "ggml-medium.bin");
  if (modelExists(medium)) return medium;
  const large = path.join(modelsDir(), "ggml-large-v3-turbo.bin");
  if (modelExists(large)) return large;
  return fastModel();
}

export function modelPath(modo: SttModo = "conversacion"): string {
  return modo === "preciso" ? accurateModel() : fastModel();
}

function signature(modo: SttModo): string {
  return `${modelPath(modo)}|${sttPrompt()}`;
}

export function whisperAvailable(): { ok: boolean; detalle: string; modelo: string; binario: string } {
  const binario = "/opt/homebrew/bin/whisper-server";
  const modelo = fastModel();
  if (!fs.existsSync(binario)) return { ok: false, detalle: "whisper-server no instalado (brew install whisper-cpp)", modelo, binario };
  if (!modelExists(modelo)) return { ok: false, detalle: "Falta el modelo ggml (.bin)", modelo, binario };
  return { ok: true, detalle: "Listo", modelo, binario };
}

async function healthy(port: number): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(1200) });
    return res.ok;
  } catch {
    return false;
  }
}

function scheduleIdleStop(m: Manager) {
  if (m.timer) clearTimeout(m.timer);
  m.timer = setTimeout(() => {
    if (Date.now() - m.lastUsed >= IDLE_MS && m.proc) {
      logEvent("info", "voz", `whisper-server :${m.port} detenido por inactividad`);
      m.proc.kill();
      m.proc = null;
    }
  }, IDLE_MS + 5000);
  m.timer.unref?.();
}

async function ensureServer(modo: SttModo): Promise<Manager> {
  const m = manager(modo);
  if (await healthy(m.port)) {
    if (m.signature && m.signature !== signature(modo)) {
      logEvent("info", "voz", "Reiniciando whisper para aplicar modelo/prompt");
      m.proc?.kill();
      m.proc = null;
    } else {
      m.lastUsed = Date.now();
      scheduleIdleStop(m);
      return m;
    }
  }
  if (m.starting) {
    await m.starting;
    return m;
  }

  const modelo = modelPath(modo);
  if (!modelExists(modelo)) throw new Error(`Falta el modelo de reconocimiento: ${path.basename(modelo)}`);
  const binario = "/opt/homebrew/bin/whisper-server";
  if (!fs.existsSync(binario)) throw new Error("whisper-server no instalado");

  m.starting = (async () => {
    m.lastError = null;
    const args = [
      "-m",
      modelo,
      "-l",
      "es",
      "-nt",
      "--host",
      "127.0.0.1",
      "--port",
      String(m.port),
      "--convert",
      "--threads",
      "8",
      ...(sttPrompt() ? ["--prompt", sttPrompt()] : []),
    ];
    const proc = spawn(binario, args, { stdio: ["ignore", "ignore", "pipe"] });
    m.proc = proc;
    m.signature = signature(modo);
    proc.stderr?.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      if (/error|failed/i.test(text)) m.lastError = redact(text.slice(0, 400));
    });
    proc.on("exit", () => {
      m.proc = null;
      m.starting = null;
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

    for (let i = 0; i < 120; i++) {
      if (await healthy(m.port)) return;
      if (!m.proc) break;
      await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error(m.lastError ?? "whisper-server no arrancó a tiempo");
  })();

  try {
    await m.starting;
    m.lastUsed = Date.now();
    scheduleIdleStop(m);
    logEvent("info", "voz", `whisper-server :${m.port} iniciado (${path.basename(modelo)})`);
    return m;
  } finally {
    m.starting = null;
  }
}

export interface Transcription {
  text: string;
  ms: number;
  modelo: string;
  modo: SttModo | "parakeet";
}

/** Transcribe audio local (webm/ogg/wav/mp3/m4a). */
export async function transcribe(input: Buffer, filename: string, modo: SttModo = "conversacion"): Promise<Transcription> {
  const started = Date.now();
  if (modo === "conversacion" && getSetting("stt_modo_conversacion", "conversacion") === "preciso") {
    modo = "preciso";
  }
  const provider = getSetting("motor_stt", "whisper");

  if (provider === "parakeet") {
    const cloud = await transcribeParakeet(input, "es-US");
    if (cloud && cloud.text) {
      return { text: cloud.text, ms: Date.now() - started, modelo: "parakeet-1.1b-rnnt-multilingual", modo: "parakeet" };
    }
  }

  const m = await ensureServer(modo);
  m.lastUsed = Date.now();
  scheduleIdleStop(m);

  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(input)]), filename || "audio.webm");
  form.append("language", "es");
  form.append("response_format", "json");
  form.append("temperature", "0.0");

  const res = await fetch(`http://127.0.0.1:${m.port}/inference`, {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(180_000),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`whisper.cpp falló (${res.status}): ${redact(detail.slice(0, 300))}`);
  }
  const data = (await res.json()) as { text?: string };
  const text = (data.text ?? "")
    .replace(/\[BLANK_AUDIO\]|\(.*?silencio.*?\)/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  return { text, ms: Date.now() - started, modelo: path.basename(modelPath(modo)), modo };
}

export function stopWhisper() {
  for (const m of Object.values(managers())) {
    if (m.proc) {
      m.proc.kill();
      m.proc = null;
    }
  }
}

export function whisperStatus() {
  const info = whisperAvailable();
  const conv = manager("conversacion");
  const prec = manager("preciso");
  return {
    disponible: info.ok,
    detalle: info.detalle,
    modelo: path.basename(fastModel()),
    modelo_conversacion: path.basename(fastModel()),
    modelo_preciso: path.basename(accurateModel()),
    calidad: getSetting("stt_calidad", "conversacion"),
    prompt: sttPrompt(),
    cargado: Boolean(conv.proc || prec.proc),
    cargado_conversacion: Boolean(conv.proc),
    cargado_preciso: Boolean(prec.proc),
    puerto: conv.port,
    ultimo_error: conv.lastError,
    memoria_estimada_mb: (conv.proc ? 700 : 0) + (prec.proc ? 1600 : 0),
  };
}
