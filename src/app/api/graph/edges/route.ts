import { upsertEdge } from "@/lib/graph";
import { handleError, ok, readJson, requireString } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await readJson<{
      from_id?: string;
      to_id?: string;
      relation?: string;
      evidence?: string;
      confidence?: number;
    }>(req);
    const fromId = requireString(body.from_id, "from_id", 100);
    const toId = requireString(body.to_id, "to_id", 100);
    const relation = requireString(body.relation, "relation", 100);
    const edge = upsertEdge({
      fromId,
      toId,
      relation,
      evidence: body.evidence,
      confidence: body.confidence ?? 1,
      origin: "usuario",
      status: "confirmada",
    });
    return ok({ edge }, 201);
  } catch (err) {
    return handleError(err);
  }
}
