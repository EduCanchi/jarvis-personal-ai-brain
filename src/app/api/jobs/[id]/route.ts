import { handleError, ok } from "@/lib/http";
import { cancelJob } from "@/lib/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    cancelJob(id);
    return ok({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
