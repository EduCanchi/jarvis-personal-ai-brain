import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { cacheDir } from "../paths";
import { getSetting } from "../db";
import { resolveVoice, synthLocal } from "./engines";

const run = promisify(execFile);

const FALLBACK_VOICES = ["Mónica", "Paulina", "Jorge", "Diego", "Monica"];

let voiceCache: { at: number; voices: Array<{ nombre: string; idioma: string; ejemplo: string }> } | null = null;

export async function listVoices() {
  if (voiceCache && Date.now() - voiceCache.at < 60_000) return voiceCache.voices;
  try {
    const { stdout } = await run("/usr/bin/say", ["-v", "?"], { maxBuffer: 2 * 1024 * 1024 });
    const voices = stdout
      .split("\n")
      .map((line) => {
        const match = line.match(/^(.+?)\s+\((.+)\)\s+(es_[A-Z]{2})\s+#\s*(.*)$/);
        if (!match) return null;
        return { nombre: match[1].trim(), idioma: match[3], ejemplo: match[4].trim() };
      })
      .filter((v): v is { nombre: string; idioma: string; ejemplo: string } => Boolean(v));
    const unique = [...new Map(voices.map((v) => [v.nombre, v])).values()].sort((a, b) => a.nombre.localeCompare(b.nombre));
    voiceCache = { at: Date.now(), voices: unique.length ? unique : [] };
    return voiceCache.voices;
  } catch {
    return FALLBACK_VOICES.map((nombre) => ({ nombre, idioma: "es_ES", ejemplo: "" }));
  }
}

export function currentVoice(): string {
  return getSetting("voz_tts", "Mónica") || "Mónica";
}

export function currentRate(): number {
  return Math.max(90, Math.min(320, Number(getSetting("voz_velocidad", "185")) || 185));
}

function cachePath(text: string, voice: string, rate: number): string {
  const hash = createHash("sha256").update(`${voice}|${rate}|${text}`).digest("hex").slice(0, 24);
  return path.join(cacheDir(), "tts", `${hash}.m4a`);
}

export async function synthesize(
  text: string,
  opts?: { voice?: string; rate?: number; motor?: "kokoro" | "piper" | "apple"; voz?: string; idioma?: "es" | "en" },
): Promise<{ file: string; ms: number; cached: boolean; mime: string }> {
  const clean = text.replace(/\s+/g, " ").trim().slice(0, 1200);
  if (!clean) throw new Error("Texto vacío para síntesis");
  const rate = opts?.rate ?? currentRate();

  const resolved = resolveVoice(clean);
  const motor = opts?.motor ?? resolved.motor;
  const idioma = opts?.idioma ?? resolved.idioma;

  if (motor !== "apple") {
    const voz = opts?.voz ?? resolved.voz;
    const result = await synthLocal({ text: clean, motor, voz, idioma, velocidad: rate / 185 });
    return { file: result.file, ms: result.ms, cached: result.cached, mime: result.mime };
  }

  const voice = opts?.voice ?? currentVoice();
  const out = cachePath(clean, voice, rate);
  await fsp.mkdir(path.dirname(out), { recursive: true });
  if (fs.existsSync(out)) return { file: out, ms: 0, cached: true, mime: "audio/mp4" };

  const started = Date.now();
  const aiff = `${out}.${process.pid}.aiff`;
  try {
    await run("/usr/bin/say", ["-v", voice, "-r", String(rate), "-o", aiff, clean], { timeout: 30_000 });
    await run("/usr/bin/afconvert", ["-f", "m4af", "-d", "aac", "-b", "64000", aiff, out], { timeout: 30_000 });
  } finally {
    fs.rmSync(aiff, { force: true });
  }
  return { file: out, ms: Date.now() - started, cached: false, mime: "audio/mp4" };
}

/** Divide en fragmentos hablables para reducir el tiempo hasta el primer audio. */
export function speechSegments(text: string, maxLen = 120): string[] {
  const clean = text
    .replace(/```[\s\S]*?```/g, " (bloque de código omitido) ")
    .replace(/[*_#>`]/g, " ")
    .replace(/\[(\d+)\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) return [];
  const sentences = clean.match(/[^.!?;:]+[.!?;:]?/g) ?? [clean];
  const out: string[] = [];
  let buffer = "";
  for (const sentence of sentences) {
    if ((buffer + " " + sentence).trim().length > maxLen && buffer) {
      out.push(buffer.trim());
      buffer = sentence.trim();
    } else {
      buffer = `${buffer} ${sentence}`.trim();
    }
  }
  if (buffer) out.push(buffer);
  return out.slice(0, 60);
}
