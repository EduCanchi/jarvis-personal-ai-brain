import { scanConnector } from "@/lib/connectors";
import { handleError, ok } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const result = await scanConnector(id);
    return ok(result);
  } catch (err) {
    return handleError(err);
  }
}
