import { setSetting } from "@/lib/db";
import { handleError, ok, readJson } from "@/lib/http";
import { VOICES } from "@/lib/voice/engines";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(req: Request) {
  try {
    const body = await readJson<{ idioma?: "es" | "en"; motor?: string; voz?: string }>(req);
    const idioma = body.idioma === "en" ? "en" : "es";
    const opcion = VOICES.find((v) => v.motor === body.motor && v.voz === body.voz && v.idioma === idioma);
    if (!opcion) throw new Error("Combinación de motor y voz no válida para ese idioma");
    if (idioma === "es") {
      setSetting("motor_voz_es", opcion.motor);
      setSetting("voz_es", opcion.voz);
    } else {
      setSetting("motor_voz_en", opcion.motor);
      setSetting("voz_en", opcion.voz);
    }
    return ok({ ok: true, idioma, motor: opcion.motor, voz: opcion.voz, nombre: opcion.nombre });
  } catch (err) {
    return handleError(err);
  }
}
