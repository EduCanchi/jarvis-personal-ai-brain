import { db, now, uuid, Row } from "./db";

export const NODE_TYPES = [
  "documento",
  "persona",
  "organizacion",
  "proyecto",
  "concepto",
  "proceso",
  "decision",
  "evento",
  "imagen",
  "lugar",
  "producto",
  "tecnologia",
  "otro",
] as const;

export type NodeType = (typeof NODE_TYPES)[number];

export function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function canonicalType(type: string): NodeType {
  const t = normalizeName(type);
  const map: Record<string, NodeType> = {
    persona: "persona",
    people: "persona",
    organizacion: "organizacion",
    organization: "organizacion",
    empresa: "organizacion",
    compania: "organizacion",
    proyecto: "proyecto",
    project: "proyecto",
    concepto: "concepto",
    concept: "concepto",
    proceso: "proceso",
    process: "proceso",
    decision: "decision",
    evento: "evento",
    event: "evento",
    documento: "documento",
    document: "documento",
    imagen: "imagen",
    image: "imagen",
    lugar: "lugar",
    location: "lugar",
    producto: "producto",
    product: "producto",
    tecnologia: "tecnologia",
    technology: "tecnologia",
  };
  return map[t] ?? "concepto";
}

export interface NodeRecord {
  id: string;
  type: NodeType;
  name: string;
  description: string | null;
  status: string;
  confidence: number;
  origin: string;
  doc_ids: string[];
  created_at: string;
  updated_at: string;
}

function hydrate(row: Row): NodeRecord {
  return { ...row, doc_ids: JSON.parse(row.doc_ids ?? "[]") } as NodeRecord;
}

export function getNode(id: string): NodeRecord | null {
  const row = db().prepare("SELECT * FROM nodes WHERE id = ?").get(id) as Row | undefined;
  return row ? hydrate(row) : null;
}

export function findNode(type: string, name: string): NodeRecord | null {
  const row = db()
    .prepare("SELECT * FROM nodes WHERE type = ? AND norm = ?")
    .get(canonicalType(type), normalizeName(name)) as Row | undefined;
  return row ? hydrate(row) : null;
}

/**
 * Busca un nodo por nombre sin importar el tipo. Prefiere tipos específicos
 * sobre "concepto" para no duplicar una persona u organización ya existente.
 */
export function resolveNodeByName(name: string): NodeRecord | null {
  const row = db()
    .prepare(
      "SELECT * FROM nodes WHERE norm = ? ORDER BY CASE type WHEN 'concepto' THEN 1 WHEN 'otro' THEN 2 ELSE 0 END, confidence DESC LIMIT 1",
    )
    .get(normalizeName(name)) as Row | undefined;
  return row ? hydrate(row) : null;
}

/**
 * Fusiona automáticamente nodos con el mismo nombre normalizado pero distinto tipo.
 * Conserva el nodo de tipo más específico y mueve todas las relaciones.
 */
/** Elimina nodos cuyos documentos de origen ya no existen (y no son manuales). */
export function pruneOrphans(): number {
  const orphanEdges = db()
    .prepare("SELECT id FROM edges WHERE doc_id IS NOT NULL AND doc_id NOT IN (SELECT id FROM documents)")
    .all() as Row[];
  for (const edge of orphanEdges) db().prepare("DELETE FROM edges WHERE id = ?").run(edge.id);

  const nodes = db().prepare("SELECT id, doc_ids, origin FROM nodes WHERE doc_ids != '[]'").all() as Row[];
  const exists = db().prepare("SELECT 1 FROM documents WHERE id = ?");
  let removed = 0;
  for (const node of nodes) {
    const ids: string[] = JSON.parse(node.doc_ids ?? "[]");
    const valid = ids.filter((id) => exists.get(id));
    if (valid.length === 0) {
      if (node.origin !== "usuario") {
        db().prepare("DELETE FROM nodes WHERE id = ?").run(node.id);
        removed++;
      }
    } else if (valid.length !== ids.length) {
      db().prepare("UPDATE nodes SET doc_ids = ? WHERE id = ?").run(JSON.stringify(valid), node.id);
    }
  }
  return removed;
}

export function dedupeNodes(): { fusionados: number } {
  pruneOrphans();
  const groups = db()
    .prepare("SELECT norm FROM nodes GROUP BY norm HAVING COUNT(*) > 1")
    .all() as Row[];
  let fusionados = 0;
  for (const group of groups) {
    const rows = db()
      .prepare(
        "SELECT * FROM nodes WHERE norm = ? ORDER BY CASE type WHEN 'concepto' THEN 1 WHEN 'otro' THEN 2 ELSE 0 END, confidence DESC",
      )
      .all(group.norm) as Row[];
    const target = rows[0];
    for (const source of rows.slice(1)) {
      try {
        mergeNodes(source.id, target.id);
        fusionados++;
      } catch {
        /* si falla una fusión, se continúa con el resto */
      }
    }
  }
  return { fusionados };
}

export function upsertNode(input: {
  name: string;
  type: string;
  description?: string;
  confidence?: number;
  origin?: "ia" | "usuario" | "documento";
  docId?: string;
  status?: "verificado" | "inferido" | "pendiente" | "usuario";
}): NodeRecord {
  const name = input.name.trim().slice(0, 200);
  if (!name) throw new Error("El nodo necesita un nombre");
  const type = canonicalType(input.type);
  const norm = normalizeName(name);
  const existing = db()
    .prepare("SELECT * FROM nodes WHERE type = ? AND norm = ?")
    .get(type, norm) as Row | undefined;
  const ts = now();
  if (existing) {
    const docIds: string[] = JSON.parse(existing.doc_ids ?? "[]");
    if (input.docId && !docIds.includes(input.docId)) docIds.push(input.docId);
    const confidence = Math.max(Number(existing.confidence), input.confidence ?? 0.6);
    const description =
      input.description && input.description.length > (existing.description?.length ?? 0)
        ? input.description.slice(0, 1200)
        : existing.description;
    db()
      .prepare(
        "UPDATE nodes SET description = ?, confidence = ?, doc_ids = ?, updated_at = ?, status = ? WHERE id = ?",
      )
      .run(
        description,
        confidence,
        JSON.stringify(docIds),
        ts,
        existing.origin === "usuario" ? existing.status : input.status ?? existing.status,
        existing.id,
      );
    return getNode(existing.id)!;
  }
  const id = uuid();
  db()
    .prepare(
      "INSERT INTO nodes(id, type, name, norm, description, status, confidence, origin, doc_ids, created_at, updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
    )
    .run(
      id,
      type,
      name,
      norm,
      input.description?.slice(0, 1200) ?? null,
      input.status ?? (input.origin === "usuario" ? "usuario" : "inferido"),
      input.confidence ?? 0.6,
      input.origin ?? "ia",
      JSON.stringify(input.docId ? [input.docId] : []),
      ts,
      ts,
    );
  return getNode(id)!;
}

export interface EdgeRecord {
  id: string;
  from_id: string;
  to_id: string;
  relation: string;
  evidence: string | null;
  confidence: number;
  origin: string;
  status: string;
  doc_id: string | null;
  chunk_id: string | null;
  created_at: string;
  from_name?: string;
  to_name?: string;
}

export function upsertEdge(input: {
  fromId: string;
  toId: string;
  relation: string;
  evidence?: string;
  confidence?: number;
  origin?: "ia" | "usuario" | "documento";
  status?: "confirmada" | "pendiente";
  docId?: string;
  chunkId?: string;
}): EdgeRecord | null {
  if (input.fromId === input.toId) return null;
  const relation = input.relation.trim().toLowerCase().slice(0, 120) || "relacionado con";
  const existing = db()
    .prepare("SELECT * FROM edges WHERE from_id = ? AND to_id = ? AND relation = ?")
    .get(input.fromId, input.toId, relation) as Row | undefined;
  if (existing) {
    if ((input.confidence ?? 0.6) > Number(existing.confidence)) {
      db()
        .prepare("UPDATE edges SET confidence = ?, evidence = COALESCE(?, evidence) WHERE id = ?")
        .run(input.confidence ?? 0.6, input.evidence?.slice(0, 600) ?? null, existing.id);
    }
    return db().prepare("SELECT * FROM edges WHERE id = ?").get(existing.id) as unknown as EdgeRecord;
  }
  const id = uuid();
  const confidence = input.confidence ?? 0.6;
  const status = input.status ?? (confidence >= 0.75 ? "confirmada" : "pendiente");
  db()
    .prepare(
      "INSERT INTO edges(id, from_id, to_id, relation, evidence, confidence, origin, status, doc_id, chunk_id, created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
    )
    .run(
      id,
      input.fromId,
      input.toId,
      relation,
      input.evidence?.slice(0, 600) ?? null,
      confidence,
      input.origin ?? "ia",
      status,
      input.docId ?? null,
      input.chunkId ?? null,
      now(),
    );
  return db().prepare("SELECT * FROM edges WHERE id = ?").get(id) as unknown as EdgeRecord;
}

export function graphData(filter?: { type?: string; status?: string; docId?: string; q?: string }) {
  const conditions: string[] = [];
  const params: any[] = [];
  if (filter?.type && filter.type !== "todos") {
    conditions.push("type = ?");
    params.push(filter.type);
  }
  if (filter?.status && filter.status !== "todos") {
    conditions.push("status = ?");
    params.push(filter.status);
  }
  if (filter?.q) {
    conditions.push("(norm LIKE ? OR description LIKE ?)");
    params.push(`%${normalizeName(filter.q)}%`, `%${filter.q}%`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const nodes = (db().prepare(`SELECT * FROM nodes ${where} ORDER BY updated_at DESC LIMIT 3000`).all(...params) as Row[]).map(
    hydrate,
  );
  const ids = new Set(nodes.map((n) => n.id));
  const edges = (db().prepare("SELECT * FROM edges LIMIT 8000").all() as Row[]).filter(
    (e) => ids.has(e.from_id) && ids.has(e.to_id),
  );
  if (filter?.docId) {
    const docId = filter.docId;
    const filtered = nodes.filter((n) => n.doc_ids.includes(docId));
    const fids = new Set(filtered.map((n) => n.id));
    return { nodes: filtered, edges: edges.filter((e) => fids.has(e.from_id) && fids.has(e.to_id)) };
  }
  return { nodes, edges };
}

export function nodeDetail(id: string) {
  const node = getNode(id);
  if (!node) return null;
  const edges = db()
    .prepare(
      `SELECT e.*, nf.name AS from_name, nt.name AS to_name, d.name AS doc_name
       FROM edges e
       JOIN nodes nf ON nf.id = e.from_id
       JOIN nodes nt ON nt.id = e.to_id
       LEFT JOIN documents d ON d.id = e.doc_id
       WHERE e.from_id = ? OR e.to_id = ?
       ORDER BY e.confidence DESC LIMIT 200`,
    )
    .all(id, id) as Row[];
  const docs = db()
    .prepare("SELECT id, name, ext, status FROM documents WHERE id IN (" + node.doc_ids.map(() => "?").join(",") + ")")
    .all(...node.doc_ids) as Row[];
  return { node, edges, documents: node.doc_ids.length ? docs : [] };
}

export function mergeNodes(sourceId: string, targetId: string) {
  if (sourceId === targetId) throw new Error("No se puede fusionar un nodo consigo mismo");
  const source = getNode(sourceId);
  const target = getNode(targetId);
  if (!source || !target) throw new Error("Nodo no encontrado");
  const docIds = [...new Set([...source.doc_ids, ...target.doc_ids])];
  const conn = db();
  conn.exec("BEGIN");
  try {
    conn.prepare("UPDATE nodes SET doc_ids = ?, updated_at = ? WHERE id = ?").run(JSON.stringify(docIds), now(), targetId);
    conn.prepare("UPDATE OR IGNORE edges SET from_id = ? WHERE from_id = ?").run(targetId, sourceId);
    conn.prepare("DELETE FROM edges WHERE from_id = ?").run(sourceId);
    conn.prepare("UPDATE OR IGNORE edges SET to_id = ? WHERE to_id = ?").run(targetId, sourceId);
    conn.prepare("DELETE FROM edges WHERE to_id = ?").run(sourceId);
    conn.prepare("DELETE FROM nodes WHERE id = ?").run(sourceId);
    conn.exec("COMMIT");
  } catch (err) {
    conn.exec("ROLLBACK");
    throw err;
  }
  return getNode(targetId);
}

export function deleteNode(id: string) {
  db().prepare("DELETE FROM nodes WHERE id = ?").run(id);
}
