import { getSetting } from "@/lib/db";
import { handleError, ok } from "@/lib/http";
import { VOICES, workerAvailable, workerStatus } from "@/lib/voice/engines";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const status = await workerStatus();
    const info = workerAvailable();
    const seleccion = {
      es: { motor: getSetting("motor_voz_es", "kokoro"), voz: getSetting("voz_es", "em_alex") },
      en: { motor: getSetting("motor_voz_en", "kokoro"), voz: getSetting("voz_en", "bm_george") },
    };
    return ok({
      voces: VOICES,
      seleccion,
      motor: status,
      disponible: info.ok,
      detalle: info.detalle,
      piper_personalizadas: (status as any)?.voices_piper ?? [],
    });
  } catch (err) {
    return handleError(err);
  }
}
