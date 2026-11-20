import { getSetting } from "@/lib/db";
import { handleError, ok } from "@/lib/http";
import { resolveVoice, synthLocal, workerStatus } from "@/lib/voice/engines";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Carga el motor de voz en segundo plano para que la primera respuesta sea rápida. */
export async function POST() {
  try {
    const resolved = resolveVoice("Hola, señor.");
    if (resolved.motor === "apple") {
      return ok({ ok: true, motor: "apple", calentado: false });
    }
    const result = await synthLocal({
      text: "Hola.",
      motor: resolved.motor,
      voz: resolved.voz,
      idioma: resolved.idioma,
    });
    const status = await workerStatus();
    return ok({
      ok: true,
      motor: resolved.motor,
      voz: resolved.voz,
      idioma: resolved.idioma,
      calentado: true,
      ms: result.ms,
      rss_mb: (status as any)?.rss_mb,
      voz_es: getSetting("voz_es", "em_alex"),
    });
  } catch (err) {
    return handleError(err);
  }
}
