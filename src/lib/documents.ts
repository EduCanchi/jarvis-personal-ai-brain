import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { db, logEvent, now, uuid, Row } from "./db";
import { uploadsDir } from "./paths";
import { enqueue } from "./jobs";

export const ALLOWED_EXT = new Set([
  "pdf",
  "docx",
  "xlsx",
  "xlsm",
  "txt",
  "md",
  "markdown",
  "csv",
  "tsv",
  "json",
  "html",
  "htm",
  "rtf",
  "log",
  "png",
  "jpg",
  "jpeg",
  "webp",
  "gif",
]);

export const MAX_BYTES = 60 * 1024 * 1024;

const MIME: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xlsm: "application/vnd.ms-excel.sheet.macroEnabled.12",
  txt: "text/plain",
  md: "text/markdown",
  csv: "text/csv",
  json: "application/json",
  html: "text/html",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};

export function sanitizeName(name: string): string {
  const base = path.basename(name.replace(/\\/g, "/")).replace(/[\u0000-\u001f\u007f]/g, "").replace(/[/\\]/g, "_").trim();
  const cleaned = base.replace(/^\.+/, "").slice(0, 180);
  return cleaned || "documento";
}

export interface AddedDocument {
  id: string;
  name: string;
  duplicate: boolean;
}

export async function addDocument(input: {
  buffer: Buffer;
  name: string;
  origin?: string;
  excludedRemote?: boolean;
}): Promise<AddedDocument> {
  const name = sanitizeName(input.name);
  const ext = path.extname(name).toLowerCase().replace(/^\./, "");
  if (!ALLOWED_EXT.has(ext)) throw new Error(`Formato no soportado: .${ext || "(sin extensión)"}`);
  if (input.buffer.length === 0) throw new Error("El archivo está vacío");
  if (input.buffer.length > MAX_BYTES) throw new Error("El archivo supera el límite de 60 MB");

  const hash = createHash("sha256").update(input.buffer).digest("hex");
  const existing = db().prepare("SELECT id, name FROM documents WHERE hash = ?").get(hash) as Row | undefined;
  if (existing) return { id: existing.id, name: existing.name, duplicate: true };

  const id = uuid();
  const folder = path.join(uploadsDir(), id);
  await fs.mkdir(folder, { recursive: true });
  const storedPath = path.join(/* turbopackIgnore: true */ folder, name);
  await fs.writeFile(storedPath, input.buffer);

  db()
    .prepare(
      "INSERT INTO documents(id, name, ext, mime, size, hash, stored_path, origin, status, added_at, excluded_remote) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
    )
    .run(
      id,
      name,
      ext,
      MIME[ext] ?? "application/octet-stream",
      input.buffer.length,
      hash,
      storedPath,
      input.origin ?? "local",
      "pendiente",
      now(),
      input.excludedRemote ? 1 : 0,
    );
  enqueue(id, "ingesta");
  logEvent("info", "documentos", `Documento añadido: ${name}`, { id, bytes: input.buffer.length });
  return { id, name, duplicate: false };
}

export function listDocuments(limit = 200) {
  return db()
    .prepare(
      `SELECT d.*, (SELECT COUNT(*) FROM chunks c WHERE c.doc_id = d.id) AS chunks,
              (SELECT COUNT(*) FROM edges e WHERE e.doc_id = d.id) AS edges
       FROM documents d ORDER BY d.added_at DESC LIMIT ?`,
    )
    .all(limit) as Row[];
}

export function documentDetail(id: string) {
  const doc = db().prepare("SELECT * FROM documents WHERE id = ?").get(id) as Row | undefined;
  if (!doc) return null;
  const chunks = db()
    .prepare("SELECT id, idx, kind, page, content FROM chunks WHERE doc_id = ? ORDER BY idx LIMIT 200")
    .all(id) as Row[];
  const job = db().prepare("SELECT * FROM jobs WHERE doc_id = ? ORDER BY created_at DESC LIMIT 1").get(id) as Row | undefined;
  const edges = db()
    .prepare(
      `SELECT e.id, e.relation, e.evidence, e.confidence, e.status, nf.name AS from_name, nt.name AS to_name
       FROM edges e JOIN nodes nf ON nf.id = e.from_id JOIN nodes nt ON nt.id = e.to_id
       WHERE e.doc_id = ? ORDER BY e.confidence DESC LIMIT 100`,
    )
    .all(id) as Row[];
  return { document: doc, chunks, job: job ?? null, edges };
}
