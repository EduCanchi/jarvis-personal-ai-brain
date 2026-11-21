import { addMemory, consolidateMemories, forgetMemory, listMemories, MEMORY_KINDS, correctMemory, whatDoYouKnowAboutMe } from "@/lib/memory";
import { handleError, ok, readJson, requireString } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const params = new URL(req.url).searchParams;
    if (params.get("vista") === "resumen") return ok(whatDoYouKnowAboutMe());
    return ok({
      memorias: listMemories({
        kind: params.get("kind") ?? undefined,
        q: params.get("q") ?? undefined,
        includeForgotten: params.get("olvidadas") === "1",
        limit: Number(params.get("limit") ?? 200),
      }),
      tipos: MEMORY_KINDS,
    });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: Request) {
  try {
    const body = await readJson<any>(req);
    if (body.accion === "consolidar") return ok(consolidateMemories());
    const kind = MEMORY_KINDS.includes(body.kind) ? body.kind : "semantica";
    const memory = addMemory({
      kind,
      content: requireString(body.content, "content", 6000),
      summary: body.summary,
      source: body.source ?? "manual",
      sourceRef: body.sourceRef,
      confidence: Number(body.confidence ?? 0.9),
      sensitive: Boolean(body.sensitive),
      provenance: { origen: "manual" },
    });
    return ok({ memory }, 201);
  } catch (err) {
    return handleError(err);
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await readJson<{ id?: string; content?: string }>(req);
    if (!body.id) throw new Error("Falta id");
    const memory = correctMemory(body.id, requireString(body.content, "content", 6000));
    return ok({ memory });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(req: Request) {
  try {
    const id = new URL(req.url).searchParams.get("id");
    if (!id) throw new Error("Falta id");
    return ok({ ok: forgetMemory(id) });
  } catch (err) {
    return handleError(err);
  }
}
