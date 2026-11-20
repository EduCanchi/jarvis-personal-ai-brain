import fs from "node:fs/promises";
import path from "node:path";
import { db, Row } from "@/lib/db";
import { fail, handleError, ok } from "@/lib/http";
import { artifactsDir } from "@/lib/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const row = db().prepare("SELECT * FROM artifacts WHERE id = ?").get(id) as Row | undefined;
    if (!row) return fail("Archivo no encontrado", 404);
    const base = artifactsDir();
    const resolved = path.resolve(row.path);
    if (!resolved.startsWith(base + path.sep)) return fail("Ruta no permitida", 403);
    const data = await fs.readFile(resolved);
    const download = new URL(req.url).searchParams.get("download") === "1";
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": row.mime,
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(row.name)}`,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (err: any) {
    return fail(err?.message ?? "Error", 400);
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const row = db().prepare("SELECT path FROM artifacts WHERE id = ?").get(id) as Row | undefined;
    if (!row) throw new Error("Archivo no encontrado");
    const base = artifactsDir();
    const resolved = path.resolve(row.path);
    if (resolved.startsWith(base + path.sep)) await fs.rm(resolved, { force: true });
    db().prepare("DELETE FROM artifacts WHERE id = ?").run(id);
    return ok({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
