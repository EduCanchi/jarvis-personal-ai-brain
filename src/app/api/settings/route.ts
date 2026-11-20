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
