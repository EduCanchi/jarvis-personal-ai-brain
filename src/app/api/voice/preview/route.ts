import fs from "node:fs/promises";
import { handleError, readJson } from "@/lib/http";
import { synthLocal } from "@/lib/voice/engines";
import { synthesize } from "@/lib/voice/tts";
import { redact } from "@/lib/secrets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const TEXTOS: Record<"es" | "en", string> = {
  es: "Buenas noches. Todos los sistemas están operativos. He revisado la agenda y el informe del proyecto; si me autorizas, preparo el resumen antes de que salgas.",
  en: "Good evening. All systems are operational. I have reviewed the schedule and the project report; with your permission, I shall prepare the briefing before you leave.",
};

export async function POST(req: Request) {
  try {
    const body = await readJson<{
      motor?: "kokoro" | "piper" | "apple";
      voz?: string;
      idioma?: "es" | "en";
      texto?: string;
      velocidad?: number;
    }>(req);

    const idioma = body.idioma === "en" ? "en" : "es";
    const texto = (body.texto ?? TEXTOS[idioma]).slice(0, 800);
    const motor = body.motor ?? "kokoro";

    if (motor === "apple") {
      const result = await synthesize(texto, { motor: "apple", voice: body.voz, rate: body.velocidad ? Math.round(body.velocidad * 185) : undefined });
      const data = await fs.readFile(result.file);
      return new Response(new Uint8Array(data), {
        headers: { "Content-Type": result.mime, "Cache-Control": "private, max-age=600", "X-Voice-Ms": String(result.ms) },
      });
    }

    if (!body.voz) {
      return new Response(JSON.stringify({ error: "Falta la voz" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }

    const result = await synthLocal({
      text: texto,
      motor,
      voz: body.voz,
      idioma,
      velocidad: body.velocidad ?? 1,
    });
    const data = await fs.readFile(result.file);
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": result.mime,
        "Cache-Control": "private, max-age=600",
        "X-Voice-Ms": String(result.ms),
        "X-Voice-Cached": result.cached ? "1" : "0",
      },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: redact(String(err?.message ?? err)) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
