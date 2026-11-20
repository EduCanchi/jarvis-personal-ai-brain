import { upsertNode } from "@/lib/graph";
import { handleError, ok, readJson, requireString } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await readJson<{ name?: string; type?: string; description?: string }>(req);
    const name = requireString(body.name, "name", 160);
    const node = upsertNode({
      name,
      type: body.type ?? "concepto",
      description: body.description,
      origin: "usuario",
      confidence: 1,
      status: "usuario",
    });
    return ok({ node }, 201);
  } catch (err) {
    return handleError(err);
  }
}
