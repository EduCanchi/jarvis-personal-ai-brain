import { NextResponse } from "next/server";
import { redact } from "./secrets";
import { NvidiaError } from "./nvidia";

export function ok(data: unknown, init?: number) {
  return NextResponse.json(data as any, { status: init ?? 200 });
}

export function fail(message: string, status = 400) {
  return NextResponse.json({ error: redact(message) }, { status });
}

export function handleError(err: unknown) {
  if (err instanceof NvidiaError) {
    const status = err.code === "sin_clave" || err.code === "auth" ? 401 : err.code === "cuota" ? 429 : 502;
    return fail(err.message, status);
  }
  const message = err instanceof Error ? err.message : String(err);
  return fail(message, 400);
}

export async function readJson<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new Error("Cuerpo JSON no válido");
  }
}

export function requireString(value: unknown, field: string, max = 10_000): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`Falta el campo "${field}"`);
  return value.trim().slice(0, max);
}
