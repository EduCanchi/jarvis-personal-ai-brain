import { confirmPending } from "@/lib/assistant";
import { handleError, ok, readJson, requireString } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

export async function POST(req: Request) {
  try {
    const body = await readJson<{ conversation_id?: string; herramienta?: string; argumentos?: Record<string, any> }>(req);
    const conversationId = requireString(body.conversation_id, "conversation_id", 100);
    const herramienta = requireString(body.herramienta, "herramienta", 100);
    const result = await confirmPending({
      conversationId,
      herramienta,
      argumentos: body.argumentos ?? {},
    });
    return ok(result);
  } catch (err) {
    return handleError(err);
  }
}
