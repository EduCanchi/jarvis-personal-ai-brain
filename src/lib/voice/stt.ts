import { spawn, ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { dataDir } from "../paths";
import { getSetting, logEvent } from "../db";
import { redact } from "../secrets";

const WHISPER_PORT = 8099;
const IDLE_MS = 10 * 60 * 1000;

interface WhisperState {
  proc: ChildProcess | null;
  starting: Promise<void> | null;
  lastUsed: number;
  idleTimer: NodeJS.Timeout | null;
  lastError: string | null;
}

const globalForVoice = globalThis as unknown as { __paibWhisper?: WhisperState };

function state(): WhisperState {
  if (!globalForVoice.__paibWhisper) {
    globalForVoice.__paibWhisper = { proc: null, starting: null, lastUsed: 0, idleTimer: null, lastError: null };
  }
  return globalForVoice.__paibWhisper;
}

export function modelPath(): string {
  const configured = getSetting("modelo_stt_ruta", "");
  if (configured && fs.existsSync(configured)) return configured;
  return path.join(dataDir(), "models", "ggml-small.bin");
}

export function whisperAvailable(): { ok: boolean; detalle: string; modelo: string; binario: string } {
  const binario = "/opt/homebrew/bin/whisper-server";
  const modelo = modelPath();
  if (!fs.existsSync(binario)) return { ok: false, detalle: "whisper-server no instalado (brew install whisper-cpp)", modelo, binario };
  if (!fs.existsSync(modelo)) return { ok: false, detalle: "Falta el modelo ggml (.bin)", modelo, binario };
  return { ok: true, detalle: "Listo", modelo, binario };
}

async function healthy(): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${WHISPER_PORT}/`, { signal: AbortSignal.timeout(1200) });
    return res.ok;
  } catch {
    return false;
  }
}

async function ensureServer(): Promise<void> {
  const s = state();
  if (await healthy()) {
    s.lastUsed = Date.now();
    scheduleIdleStop();
    return;
  }
  if (s.starting) return s.starting;

  const info = whisperAvailable();
  if (!info.ok) throw new Error(info.detalle);

  s.starting = (async () => {
    s.lastError = null;
    const proc = spawn(
      info.binario,
      [
        "-m",
        info.modelo,
        "-l",
        "es",
        "-nt",
        "--host",
        "127.0.0.1",
        "--port",
        String(WHISPER_PORT),
        "--convert",
        "--threads",
        "4",
      ],
      { stdio: ["ignore", "ignore", "pipe"] },
    );
    s.proc = proc;
    proc.stderr?.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      if (/error|failed/i.test(text)) s.lastError = redact(text.slice(0, 400));
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

    for (let i = 0; i < 120; i++) {
      if (await healthy()) return;
      if (!s.proc) break;
      await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error(s.lastError ?? "whisper-server no arrancó a tiempo");
  })();

  try {
    await s.starting;
    s.lastUsed = Date.now();
    scheduleIdleStop();
    logEvent("info", "voz", "whisper-server iniciado");
  } finally {
    s.starting = null;
  }
}

function scheduleIdleStop() {
  const s = state();
  if (s.idleTimer) clearTimeout(s.idleTimer);
  s.idleTimer = setTimeout(() => {
    if (Date.now() - s.lastUsed >= IDLE_MS && s.proc) {
      logEvent("info", "voz", "whisper-server detenido por inactividad");
      s.proc.kill();
      s.proc = null;
    }
  }, IDLE_MS + 5000);
  s.idleTimer.unref?.();
}

export interface Transcription {
  text: string;
  ms: number;
  modelo: string;
}

/** Transcribe audio (webm/ogg/wav/mp3/m4a) con whisper.cpp en local. */
export async function transcribe(input: Buffer, filename: string): Promise<Transcription> {
  const started = Date.now();
  await ensureServer();
  const s = state();
  s.lastUsed = Date.now();
  scheduleIdleStop();

  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(input)]), filename || "audio.webm");
  form.append("language", "es");
  form.append("response_format", "json");
  form.append("temperature", "0.0");

  const res = await fetch(`http://127.0.0.1:${WHISPER_PORT}/inference`, {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(120_000),
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
  return { text, ms: Date.now() - started, modelo: path.basename(modelPath()) };
}

export function stopWhisper() {
  const s = state();
  if (s.proc) {
    s.proc.kill();
    s.proc = null;
  }
}

export function whisperStatus() {
  const s = state();
  const info = whisperAvailable();
  return {
    disponible: info.ok,
    detalle: info.detalle,
    modelo: path.basename(info.modelo),
    cargado: Boolean(s.proc),
    puerto: WHISPER_PORT,
    ultimo_error: s.lastError,
    memoria_estimada_mb: s.proc ? 700 : 0,
    plataforma: `${os.platform()} ${os.arch()}`,
  };
}
