import fs from "node:fs/promises";
import path from "node:path";
import { db, Row } from "@/lib/db";
import { fail } from "@/lib/http";
import { safeUploadPath, uploadsDir } from "@/lib/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIME: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  txt: "text/plain; charset=utf-8",
  md: "text/markdown; charset=utf-8",
  csv: "text/csv; charset=utf-8",
  json: "application/json",
  html: "text/html; charset=utf-8",
};

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const doc = db().prepare("SELECT * FROM documents WHERE id = ?").get(id) as Row | undefined;
    if (!doc) return fail("Documento no encontrado", 404);
    const stored = safeUploadPath(path.relative(uploadsDir(), doc.stored_path));
    const data = await fs.readFile(stored);
    const download = new URL(req.url).searchParams.get("download") === "1";
    const filename = encodeURIComponent(doc.name);
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": MIME[doc.ext] ?? "application/octet-stream",
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${filename}`,
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch (err: any) {
    return fail(err?.message ?? "Error leyendo archivo", 400);
  }
}
