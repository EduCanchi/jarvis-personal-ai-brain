import { db } from "@/lib/db";
import { handleError, ok, readJson } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const body = await readJson<{ status?: string; relation?: string; evidence?: string; confidence?: number }>(req);
    const exists = db().prepare("SELECT id FROM edges WHERE id = ?").get(id);
    if (!exists) throw new Error("Relación no encontrada");
    db()
      .prepare(
        "UPDATE edges SET status = COALESCE(?, status), relation = COALESCE(?, relation), evidence = COALESCE(?, evidence), confidence = COALESCE(?, confidence), origin = 'usuario' WHERE id = ?",
      )
      .run(body.status ?? null, body.relation ?? null, body.evidence ?? null, body.confidence ?? null, id);
    return ok({ edge: db().prepare("SELECT * FROM edges WHERE id = ?").get(id) });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    db().prepare("DELETE FROM edges WHERE id = ?").run(id);
    return ok({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
