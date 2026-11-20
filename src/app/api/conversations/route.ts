import { db } from "@/lib/db";
import { handleError, ok } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const conversations = db()
      .prepare(
        `SELECT c.*, (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) AS mensajes
         FROM conversations c ORDER BY c.updated_at DESC LIMIT 100`,
      )
      .all();
    return ok({ conversations });
  } catch (err) {
    return handleError(err);
  }
}
