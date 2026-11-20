import { db } from "@/lib/db";
import { documentDetail, sanitizeName } from "@/lib/documents";
import { handleError, ok, readJson } from "@/lib/http";
import { deleteDocument } from "@/lib/ingest";
import { enqueue } from "@/lib/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const detail = documentDetail(id);
    if (!detail) throw new Error("Documento no encontrado");
    return ok(detail);
  } catch (err) {
    return handleError(err);
  }
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const body = await readJson<{ excluded_remote?: boolean; name?: string }>(req);
    if (typeof body.excluded_remote === "boolean") {
      db().prepare("UPDATE documents SET excluded_remote = ? WHERE id = ?").run(body.excluded_remote ? 1 : 0, id);
    }
    if (body.name) {
      db().prepare("UPDATE documents SET name = ? WHERE id = ?").run(sanitizeName(body.name), id);
    }
    return ok(documentDetail(id));
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const row = db().prepare("SELECT id FROM documents WHERE id = ?").get(id);
    if (!row) throw new Error("Documento no encontrado");
    await deleteDocument(id);
    return ok({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const row = db().prepare("SELECT id FROM documents WHERE id = ?").get(id);
    if (!row) throw new Error("Documento no encontrado");
    db().prepare("UPDATE documents SET status = 'pendiente', error = NULL WHERE id = ?").run(id);
    const jobId = enqueue(id, "ingesta");
    return ok({ ok: true, job: jobId });
  } catch (err) {
    return handleError(err);
  }
}
