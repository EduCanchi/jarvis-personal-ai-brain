import { db, getSetting, setSetting, Row } from "@/lib/db";
import { handleError, ok, readJson, requireString } from "@/lib/http";
import { sendNotification } from "@/lib/tools/personal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const recientes = db()
      .prepare("SELECT id, channel, title, status, error, created_at FROM notifications ORDER BY created_at DESC LIMIT 20")
      .all() as Row[];
    return ok({
      canal: getSetting("canal_notificaciones", "local"),
      ntfy_topic: getSetting("ntfy_topic", ""),
      telegram_configurado: Boolean(getSetting("telegram_token", "") && getSetting("telegram_chat_id", "")),
      telegram_chat_id: getSetting("telegram_chat_id", ""),
      recientes,
    });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: Request) {
  try {
    const body = await readJson<{ titulo?: string; mensaje?: string; canal?: string }>(req);
    const titulo = requireString(body.titulo, "titulo", 160);
    const mensaje = requireString(body.mensaje, "mensaje", 1200);
    const result = await sendNotification({ title: titulo, body: mensaje, channel: body.canal });
    return ok(result, result.ok ? 200 : 502);
  } catch (err) {
    return handleError(err);
  }
}

export async function PUT(req: Request) {
  try {
    const body = await readJson<Record<string, string>>(req);
    if (body.canal_notificaciones) setSetting("canal_notificaciones", body.canal_notificaciones);
    if (body.ntfy_topic !== undefined) setSetting("ntfy_topic", String(body.ntfy_topic).slice(0, 120));
    if (body.telegram_token !== undefined) setSetting("telegram_token", String(body.telegram_token).trim().slice(0, 200));
    if (body.telegram_chat_id !== undefined) setSetting("telegram_chat_id", String(body.telegram_chat_id).trim().slice(0, 60));
    return ok({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
