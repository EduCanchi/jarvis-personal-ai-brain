import { getApiKey, redact } from "./secrets";
import { getSetting, logEvent } from "./db";

export const NVIDIA_BASE_URL = process.env.NVIDIA_BASE_URL ?? "https://integrate.api.nvidia.com/v1";

export type ChatMessage =
  | { role: "system" | "user" | "assistant"; content: string }
  | { role: "user"; content: Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }> };

export class NvidiaError extends Error {
  code: "sin_clave" | "auth" | "cuota" | "saturado" | "timeout" | "red" | "modelo" | "desconocido";
  status?: number;
  retriable: boolean;
  constructor(code: NvidiaError["code"], message: string, status?: number, retriable = false) {
    super(message);
    this.code = code;
    this.status = status;
    this.retriable = retriable;
  }
}

let active = 0;
const waiters: Array<() => void> = [];

async function acquire(): Promise<() => void> {
  const limit = Math.max(1, Number(getSetting("concurrencia", "2")) || 2);
  if (active < limit) {
    active++;
    return release;
  }
  await new Promise<void>((resolve) => waiters.push(resolve));
  active++;
  return release;
}

function release() {
  active = Math.max(0, active - 1);
  const next = waiters.shift();
  if (next) next();
}

export function inFlight(): number {
  return active;
}

function classify(status: number, body: string): NvidiaError {
  const text = redact(body).slice(0, 600);
  if (status === 401 || status === 403) return new NvidiaError("auth", "La clave de NVIDIA no es válida o no tiene acceso a este modelo.", status);
  if (status === 402 || status === 429) return new NvidiaError("cuota", "Límite de uso de NVIDIA Build alcanzado. Reintenta más tarde.", status, true);
  if (status === 404) return new NvidiaError("modelo", `Modelo no disponible: ${text}`, status);
  if (status === 400 && /overload/i.test(text)) return new NvidiaError("saturado", "El servicio de NVIDIA está saturado.", status, true);
  if (status >= 500) return new NvidiaError("saturado", `Servicio de NVIDIA no disponible (${status}).`, status, true);
  return new NvidiaError("desconocido", text || `Error ${status}`, status);
}

function requireKey(): string {
  const key = getApiKey();
  if (!key) {
    throw new NvidiaError("sin_clave", "No hay clave de NVIDIA configurada. Añádela en Configuración → API.");
  }
  return key;
}

async function rawRequest(pathname: string, body: unknown, timeoutMs: number): Promise<any> {
  const key = requireKey();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${NVIDIA_BASE_URL}${pathname}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw classify(res.status, text);
    }
    return await res.json();
  } catch (err: any) {
    if (err instanceof NvidiaError) throw err;
    if (err?.name === "AbortError") throw new NvidiaError("timeout", "NVIDIA no respondió a tiempo.", undefined, true);
    throw new NvidiaError("red", `No se pudo conectar con NVIDIA: ${redact(String(err?.message ?? err))}`, undefined, true);
  } finally {
    clearTimeout(timer);
  }
}

async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const e = err as NvidiaError;
      if (!(e instanceof NvidiaError) || !e.retriable || i === attempts - 1) break;
      const wait = Math.min(30_000, 1200 * 2 ** i) + Math.random() * 500;
      logEvent("warn", "nvidia", `Reintento ${i + 1}/${attempts - 1} por ${e.code}`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastErr;
}

export interface ChatOptions {
  model?: string;
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  thinking?: boolean;
  timeoutMs?: number;
}

export interface ChatResult {
  content: string;
  reasoning: string;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  model: string;
}

export async function chat(opts: ChatOptions): Promise<ChatResult> {
  const releaseLock = await acquire();
  try {
    const model = opts.model ?? getSetting("modelo_principal");
    const body: Record<string, unknown> = {
      model,
      messages: opts.messages,
      temperature: opts.temperature ?? Number(getSetting("temperatura", "0.3")),
      top_p: 0.95,
      max_tokens: opts.maxTokens ?? Number(getSetting("max_tokens", "8192")),
      stream: false,
    };
    if (opts.thinking !== undefined) {
      body.chat_template_kwargs = { enable_thinking: opts.thinking };
    }
    const data = await withRetry(() => rawRequest("/chat/completions", body, opts.timeoutMs ?? 180_000));
    const choice = data?.choices?.[0];
    const content: string = choice?.message?.content ?? "";
    const reasoning: string = choice?.message?.reasoning_content ?? "";
    if (!content && !reasoning) {
      throw new NvidiaError("modelo", "El modelo devolvió una respuesta vacía.");
    }
    return { content, reasoning, usage: data?.usage, model: data?.model ?? model };
  } finally {
    releaseLock();
  }
}

export async function vision(opts: {
  prompt: string;
  imageDataUrl: string;
  model?: string;
  maxTokens?: number;
  thinking?: boolean;
}): Promise<ChatResult> {
  const model = opts.model ?? getSetting("modelo_vision");
  return chat({
    model,
    thinking: opts.thinking ?? false,
    maxTokens: opts.maxTokens ?? 2048,
    temperature: 0.2,
    timeoutMs: 240_000,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: opts.prompt },
          { type: "image_url", image_url: { url: opts.imageDataUrl } },
        ],
      },
    ],
  });
}

export async function embed(texts: string[], kind: "query" | "passage" = "passage"): Promise<number[][]> {
  if (texts.length === 0) return [];
  const releaseLock = await acquire();
  try {
    const model = getSetting("modelo_embeddings");
    const out: number[][] = [];
    const batchSize = 16;
    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize).map((t) => t.slice(0, 8000));
      const data = await withRetry(() =>
        rawRequest("/embeddings", { model, input: batch, input_type: kind, truncate: "END" }, 120_000),
      );
      const vectors: number[][] = (data?.data ?? []).map((d: any) => d.embedding as number[]);
      if (vectors.length !== batch.length) {
        throw new NvidiaError("modelo", "El servicio de embeddings devolvió un número inesperado de vectores.");
      }
      out.push(...vectors);
    }
    return out;
  } finally {
    releaseLock();
  }
}

export async function listModels(): Promise<{ id: string; owned_by?: string }[]> {
  const key = requireKey();
  const res = await fetch(`${NVIDIA_BASE_URL}/models`, {
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) throw classify(res.status, await res.text().catch(() => ""));
  const data = await res.json();
  return data?.data ?? [];
}

/** Extrae JSON aunque el modelo lo envuelva en texto o bloques markdown. */
export function parseJsonLoose<T = unknown>(text: string): T {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    /* continúa */
  }
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    try {
      return JSON.parse(fenced[1].trim()) as T;
    } catch {
      /* continúa */
    }
  }
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    const slice = trimmed.slice(start, end + 1);
    return JSON.parse(slice) as T;
  }
  throw new Error("La respuesta del modelo no contiene JSON válido");
}
