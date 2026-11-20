import { db, now, Row } from "./db";
import { embed } from "./nvidia";
import { getSetting } from "./db";

function toBlob(vector: number[]): Uint8Array {
  return new Uint8Array(Float32Array.from(vector).buffer);
}

function fromBlob(blob: Uint8Array): Float32Array {
  return new Float32Array(blob.buffer, blob.byteOffset, blob.byteLength / 4);
}

export function saveEmbedding(chunkId: string, vector: number[], model: string) {
  db()
    .prepare(
      "INSERT INTO embeddings(chunk_id, model, dim, vector, created_at) VALUES(?, ?, ?, ?, ?) " +
        "ON CONFLICT(chunk_id) DO UPDATE SET model=excluded.model, dim=excluded.dim, vector=excluded.vector, created_at=excluded.created_at",
    )
    .run(chunkId, model, vector.length, toBlob(vector), now());
}

export async function embedTexts(texts: string[], kind: "query" | "passage" = "passage"): Promise<number[][]> {
  const model = getSetting("modelo_embeddings");
  const vectors = await embed(texts, kind);
  return vectors.map((v) => Array.from(v));
}

export interface VectorHit {
  chunk_id: string;
  doc_id: string;
  score: number;
}

export function vectorSearch(query: number[], limit = 30): VectorHit[] {
  const rows = db()
    .prepare(
      "SELECT e.chunk_id, e.vector, c.doc_id FROM embeddings e JOIN chunks c ON c.id = e.chunk_id",
    )
    .all() as Row[];
  if (rows.length === 0) return [];
  const q = Float32Array.from(query);
  let qNorm = 0;
  for (let i = 0; i < q.length; i++) qNorm += q[i] * q[i];
  qNorm = Math.sqrt(qNorm) || 1;
  const hits: VectorHit[] = [];
  for (const row of rows) {
    const vec = fromBlob(row.vector as Uint8Array);
    const n = Math.min(vec.length, q.length);
    let dot = 0;
    let norm = 0;
    for (let i = 0; i < n; i++) {
      dot += vec[i] * q[i];
      norm += vec[i] * vec[i];
    }
    hits.push({ chunk_id: row.chunk_id, doc_id: row.doc_id, score: dot / (Math.sqrt(norm) * qNorm || 1) });
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}

/** Búsqueda léxica con FTS5 (bm25). */
export function textSearch(query: string, limit = 30): VectorHit[] {
  const terms = query
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2)
    .slice(0, 12);
  if (terms.length === 0) return [];
  const match = terms.map((t) => `${t}*`).join(" OR ");
  try {
    const rows = db()
      .prepare(
        `SELECT f.chunk_id AS chunk_id, c.doc_id AS doc_id, bm25(chunks_fts) AS rank
         FROM chunks_fts f JOIN chunks c ON c.id = f.chunk_id
         WHERE chunks_fts MATCH ? ORDER BY rank LIMIT ?`,
      )
      .all(match, limit) as Row[];
    return rows.map((r) => ({ chunk_id: r.chunk_id, doc_id: r.doc_id, score: 1 / (1 + Math.abs(r.rank)) }));
  } catch {
    return [];
  }
}

/** Fusión recíproca de rangos entre búsqueda léxica y vectorial. */
export function hybridSearch(query: string, queryVector: number[] | null, limit = 12): VectorHit[] {
  const lexical = textSearch(query, 40);
  const semantic = queryVector ? vectorSearch(queryVector, 40) : [];
  const scores = new Map<string, { score: number; doc_id: string }>();
  const add = (hits: VectorHit[], weight: number) => {
    hits.forEach((hit, idx) => {
      const prev = scores.get(hit.chunk_id);
      const contribution = weight / (60 + idx + 1);
      if (prev) prev.score += contribution;
      else scores.set(hit.chunk_id, { score: contribution, doc_id: hit.doc_id });
    });
  };
  add(lexical, 1);
  add(semantic, 1.2);
  return [...scores.entries()]
    .map(([chunk_id, v]) => ({ chunk_id, doc_id: v.doc_id, score: v.score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
