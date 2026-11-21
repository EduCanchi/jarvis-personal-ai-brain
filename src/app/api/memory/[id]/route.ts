import { explainMemory } from "@/lib/memory";
import { handleError, ok } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const detail = explainMemory(id);
    if (!detail) throw new Error("Memoria no encontrada");
    return ok(detail);
  } catch (err) {
    return handleError(err);
  }
}
