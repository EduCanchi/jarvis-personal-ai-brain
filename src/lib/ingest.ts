import fs from "node:fs/promises";
import { db, getSetting, logEvent, now, uuid, Row } from "./db";
import { parseDocument } from "./parsers";
import { chunkText } from "./chunk";
import { embedTexts, saveEmbedding } from "./embeddings";
import { describeImage, extractKnowledge } from "./extract";
import { dedupeNodes, resolveNodeByName, upsertEdge, upsertNode } from "./graph";
import { NvidiaError } from "./nvidia";
import { redact } from "./secrets";

export type Progress = (percent: number, step: string) => void;

interface DocumentRow {
  id: string;
  name: string;
  ext: string;
  mime: string;
  stored_path: string;
  excluded_remote: number;
  status: string;
}

function getDoc(id: string): DocumentRow {
  const row = db().prepare("SELECT * FROM documents WHERE id = ?").get(id) as Row | undefined;
  if (!row) throw new Error("Documento no encontrado");
  return row as unknown as DocumentRow;
}

function setDocStatus(id: string, status: string, patch: Record<string, unknown> = {}) {
  const fields = ["status = ?"];
  const values: any[] = [status];
  for (const [k, v] of Object.entries(patch)) {
    fields.push(`${k} = ?`);
    values.push(v);
  }
  db().prepare(`UPDATE documents SET ${fields.join(", ")} WHERE id = ?`).run(...values, id);
}

function remoteAllowed(doc: DocumentRow): boolean {
  return getSetting("procesamiento_remoto", "true") === "true" && doc.excluded_remote === 0;
}

function insertChunk(docId: string, idx: number, content: string, kind: string, page?: number): string {
  const id = uuid();
  db()
    .prepare("INSERT INTO chunks(id, doc_id, idx, kind, page, content, created_at) VALUES(?,?,?,?,?,?,?)")
    .run(id, docId, idx, kind, page ?? null, content, now());
  db().prepare("INSERT INTO chunks_fts(content, chunk_id) VALUES(?, ?)").run(content, id);
  return id;
}

export async function processDocument(docId: string, progress: Progress, isCancelled: () => boolean): Promise<void> {
  const doc = getDoc(docId);
  const warnings: string[] = [];
  const check = () => {
    if (isCancelled()) throw new Error("__cancelado__");
  };

  setDocStatus(docId, "procesando", { error: null });
  progress(5, "Leyendo archivo");

  const filePath = doc.stored_path;
  const parsed = await parseDocument(filePath, doc.ext);
  warnings.push(...parsed.warnings);
  check();
  progress(20, "Texto extraído");

  const blocks: string[] = [];
  const visionBlocks: Array<{ content: string; page?: number }> = [];
  if (parsed.text.trim()) blocks.push(parsed.text.trim());

  if (parsed.images.length > 0) {
    if (!remoteAllowed(doc)) {
      warnings.push("Interpretación visual omitida: el documento está excluido del procesamiento remoto.");
    } else {
      const total = parsed.images.length;
      for (let i = 0; i < total; i++) {
        check();
        const image = parsed.images[i];
        progress(20 + Math.round((i / total) * 25), `Analizando imagen ${i + 1}/${total}`);
        try {
          const description = await describeImage(image.dataUrl, image.label);
          const block = `[Descripción visual — ${image.label}]\n${description}`;
          blocks.push(block);
          visionBlocks.push({ content: block, page: image.page });
        } catch (err: any) {
          const msg = redact(String(err?.message ?? err));
          warnings.push(`No se pudo interpretar ${image.label}: ${msg}`);
          if (err instanceof NvidiaError && err.code === "auth") throw err;
        }
      }
    }
  }

  const fullText = blocks.join("\n\n");
  if (!fullText.trim()) {
    throw new Error("No se pudo extraer contenido del documento (puede requerir OCR o visión)");
  }

  check();
  progress(48, "Fragmentando contenido");
  const oldChunks = db().prepare("SELECT id FROM chunks WHERE doc_id = ?").all(docId) as Row[];
  const dropFts = db().prepare("DELETE FROM chunks_fts WHERE chunk_id = ?");
  for (const row of oldChunks) dropFts.run(row.id);
  db().prepare("DELETE FROM chunks WHERE doc_id = ?").run(docId);

  const visionDrafts = visionBlocks.map((b) => ({ content: b.content, page: b.page, kind: "vision" as const }));
  const textDrafts = parsed.pageTexts.some((p) => p.text.trim().length > 0)
    ? parsed.pageTexts.flatMap((p) => chunkText(p.text, { page: p.page }))
    : chunkText(parsed.text);
  const drafts = [...textDrafts, ...visionDrafts];
  if (drafts.length === 0) drafts.push(...chunkText(fullText));
  const chunkIds: string[] = [];
  drafts.forEach((draft, idx) => {
    chunkIds.push(insertChunk(docId, idx, draft.content, draft.kind ?? "texto", draft.page));
  });

  if (remoteAllowed(doc) && chunkIds.length > 0) {
    progress(55, "Generando representaciones semánticas");
    try {
      const batchSize = 8;
      for (let i = 0; i < chunkIds.length; i += batchSize) {
        check();
        const slice = chunkIds.slice(i, i + batchSize);
        const vectors = await embedTexts(drafts.slice(i, i + batchSize).map((d) => d.content));
        vectors.forEach((vec, j) => saveEmbedding(slice[j], vec, getSetting("modelo_embeddings")));
        progress(55 + Math.round((i / chunkIds.length) * 20), "Generando representaciones semánticas");
      }
    } catch (err: any) {
      warnings.push(`Búsqueda semántica incompleta: ${redact(String(err?.message ?? err))}`);
    }
  } else if (chunkIds.length > 0) {
    warnings.push("Sin embeddings: búsqueda limitada a texto completo (FTS5).");
  }

  const docNode = upsertNode({
    name: doc.name,
    type: "documento",
    description: `Documento ${doc.ext.toUpperCase()} incorporado al cerebro.`,
    confidence: 1,
    origin: "documento",
    docId,
    status: "verificado",
  });

  if (remoteAllowed(doc)) {
    progress(78, "Identificando entidades y relaciones");
    db().prepare("DELETE FROM edges WHERE doc_id = ?").run(docId);
    try {
      const groups: string[] = [];
      let buffer = "";
      for (const draft of drafts) {
        if (buffer.length + draft.content.length > 6000 && buffer) {
          groups.push(buffer);
          buffer = "";
        }
        buffer += (buffer ? "\n\n" : "") + draft.content;
      }
      if (buffer) groups.push(buffer);
      const limited = groups.slice(0, 8);

      let summary = "";
      for (let i = 0; i < limited.length; i++) {
        check();
        progress(78 + Math.round((i / limited.length) * 15), `Analizando conocimiento ${i + 1}/${limited.length}`);
        try {
          const extraction = await extractKnowledge(limited[i], doc.name);
          if (!summary && extraction.resumen) summary = extraction.resumen;
          for (const entity of extraction.entidades) {
            const node = upsertNode({
              name: entity.nombre,
              type: entity.tipo,
              description: entity.descripcion,
              confidence: entity.confianza,
              origin: "ia",
              docId,
            });
            upsertEdge({
              fromId: docNode.id,
              toId: node.id,
              relation: "menciona",
              confidence: 1,
              origin: "documento",
              docId,
              status: "confirmada",
            });
          }
          for (const rel of extraction.relaciones) {
            const from = resolveNodeByName(rel.origen) ?? upsertNode({ name: rel.origen, type: "concepto", origin: "ia", docId });
            const to = resolveNodeByName(rel.destino) ?? upsertNode({ name: rel.destino, type: "concepto", origin: "ia", docId });
            upsertEdge({
              fromId: from.id,
              toId: to.id,
              relation: rel.relacion,
              evidence: rel.evidencia,
              confidence: rel.confianza,
              origin: "ia",
              docId,
              status: rel.confianza >= 0.75 ? "confirmada" : "pendiente",
            });
          }
          if (summary) {
            db().prepare("UPDATE nodes SET description = ? WHERE id = ?").run(summary.slice(0, 1200), docNode.id);
          }
        } catch (err: any) {
          const msg = redact(String(err?.message ?? err));
          warnings.push(`Extracción parcial (${i + 1}/${limited.length}): ${msg}`);
          if (err instanceof NvidiaError && err.code === "auth") throw err;
        }
      }
    } catch (err: any) {
      warnings.push(`Extracción de conocimiento incompleta: ${redact(String(err?.message ?? err))}`);
    }
  } else {
    warnings.push("Extracción de entidades omitida: procesamiento remoto desactivado.");
  }

  check();
  progress(94, "Consolidando duplicados");
  const dedupe = dedupeNodes();
  if (dedupe.fusionados > 0) warnings.push(`${dedupe.fusionados} nodo(s) duplicado(s) fusionados automáticamente.`);

  progress(96, "Guardando memoria");
  setDocStatus(docId, "procesado", {
    error: warnings.length ? warnings.slice(0, 8).join(" · ").slice(0, 1500) : null,
    pages: parsed.pages || null,
    chars: fullText.length,
    processed_at: now(),
    meta: JSON.stringify({ warnings: warnings.slice(0, 20), fragmentos: chunkIds.length }),
  });
  logEvent("info", "ingesta", `Documento procesado: ${doc.name}`, {
    fragmentos: chunkIds.length,
    avisos: warnings.length,
  });
  progress(100, "Completado");
}

export async function deleteDocument(docId: string) {
  const doc = getDoc(docId);
  db().prepare("DELETE FROM edges WHERE doc_id = ?").run(docId);
  const linked = db().prepare("SELECT id, doc_ids FROM nodes WHERE doc_ids LIKE ?").all(`%${docId}%`) as Row[];
  for (const node of linked) {
    const remaining: string[] = (JSON.parse(node.doc_ids ?? "[]") as string[]).filter((id) => id !== docId);
    if (remaining.length === 0) {
      db().prepare("DELETE FROM nodes WHERE id = ?").run(node.id);
    } else {
      db().prepare("UPDATE nodes SET doc_ids = ? WHERE id = ?").run(JSON.stringify(remaining), node.id);
    }
  }
  db().prepare("DELETE FROM documents WHERE id = ?").run(docId);
  try {
    await fs.rm(doc.stored_path, { force: true });
  } catch {
    /* el archivo puede no existir */
  }
}
