import { mergeNodes } from "@/lib/graph";
import { handleError, ok, readJson } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const body = await readJson<{ target_id?: string }>(req);
    if (!body.target_id) throw new Error('Falta "target_id"');
    const node = mergeNodes(id, body.target_id);
    return ok({ node });
  } catch (err) {
    return handleError(err);
  }
}
