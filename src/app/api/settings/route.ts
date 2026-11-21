import { db, getSetting, setSetting } from "@/lib/db";
import { handleError, ok, readJson } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED = new Set([
  "modelo_principal",
  "modelo_vision",
  "modelo_embeddings",
  "razonamiento_visible",
  "max_tokens",
  "temperatura",
  "tamano_fragmento",
  "solapamiento_fragmento",
  "concurrencia",
  "procesamiento_remoto",
  "tema",
  "voz_tts",
  "voz_velocidad",
  "voz_volumen",
  "palabra_activacion",
  "modo_manos_libres",
  "auto_tts",
  "canal_notificaciones",
  "ntfy_topic",
  "telegram_token",
  "telegram_chat_id",
  "modelo_stt_ruta",
  "modelo_voz",
  "motor_stt",
  "motor_voz_es",
  "voz_es",
  "motor_voz_en",
  "voz_en",
  "silencio_ms",
  "salud_habilitada",
  "correo_habilitado",
  "memoria_automatica",
  "magpie_function_id",
  "parakeet_function_id",
]);

export async function GET() {
  try {
    const rows = db().prepare("SELECT key, value FROM settings ORDER BY key").all();
    const settings: Record<string, string> = {};
    for (const row of rows as any[]) settings[row.key] = row.value;
    return ok({ settings });
  } catch (err) {
    return handleError(err);
  }
}

export async function PUT(req: Request) {
  try {
    const body = await readJson<Record<string, unknown>>(req);
    for (const [key, value] of Object.entries(body)) {
      if (!ALLOWED.has(key)) continue;
      setSetting(key, String(value));
    }
    return ok({ ok: true, procesamiento_remoto: getSetting("procesamiento_remoto") });
  } catch (err) {
    return handleError(err);
  }
}
