import { db } from "@/lib/db";
import { deleteNode, getNode, nodeDetail } from "@/lib/graph";
import { handleError, ok, readJson } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const detail = nodeDetail(id);
    if (!detail) throw new Error("Nodo no encontrado");
    return ok(detail);
  } catch (err) {
    return handleError(err);
  }
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const node = getNode(id);
    if (!node) throw new Error("Nodo no encontrado");
    const body = await readJson<{ name?: string; type?: string; description?: string; status?: string }>(req);
    db()
      .prepare(
        "UPDATE nodes SET name = COALESCE(?, name), type = COALESCE(?, type), description = COALESCE(?, description), status = COALESCE(?, status), origin = 'usuario', updated_at = ? WHERE id = ?",
      )
      .run(body.name ?? null, body.type ?? null, body.description ?? null, body.status ?? null, new Date().toISOString(), id);
    return ok({ node: getNode(id) });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    deleteNode(id);
    return ok({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
