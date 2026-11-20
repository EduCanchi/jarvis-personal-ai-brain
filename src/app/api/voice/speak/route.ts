import fs from "node:fs/promises";
import { fail, handleError, ok, readJson, requireString } from "@/lib/http";
import { synthesize, speechSegments } from "@/lib/voice/tts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const body = await readJson<{
      text?: string;
      voice?: string;
      rate?: number;
      segments?: boolean;
      motor?: "kokoro" | "piper" | "apple";
      voz?: string;
      idioma?: "es" | "en";
    }>(req);
    const text = requireString(body.text, "text", 4000);
    if (body.segments) {
      return ok({ segments: speechSegments(text) });
    }
    const result = await synthesize(text, {
      voice: body.voice,
      rate: body.rate,
      motor: body.motor,
      voz: body.voz,
      idioma: body.idioma,
    });
    const data = await fs.readFile(result.file);
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": result.mime,
        "Content-Length": String(data.length),
        "Cache-Control": "private, max-age=3600",
        "X-Sintesis-Ms": String(result.ms),
        "X-Cache": result.cached ? "hit" : "miss",
      },
    });
  } catch (err) {
    return handleError(err);
  }
}

export async function GET() {
  try {
    return fail("Usa POST con {text}", 405);
  } catch (err) {
    return handleError(err);
  }
}
