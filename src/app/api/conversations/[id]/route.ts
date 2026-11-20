import { db } from "@/lib/db";
import { handleError, ok } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const conversation = db().prepare("SELECT * FROM conversations WHERE id = ?").get(id);
    if (!conversation) throw new Error("Conversación no encontrada");
    const messages = db()
      .prepare("SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at, rowid")
      .all(id)
      .map((m: any) => ({ ...m, citations: m.citations ? JSON.parse(m.citations) : [] }));
    return ok({ conversation, messages });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    db().prepare("DELETE FROM conversations WHERE id = ?").run(id);
    return ok({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
