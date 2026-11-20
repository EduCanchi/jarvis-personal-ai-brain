import { graphData } from "@/lib/graph";
import { handleError, ok } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const params = new URL(req.url).searchParams;
    const data = graphData({
      type: params.get("type") ?? undefined,
      status: params.get("status") ?? undefined,
      docId: params.get("doc") ?? undefined,
      q: params.get("q") ?? undefined,
    });
    return ok(data);
  } catch (err) {
    return handleError(err);
  }
}
