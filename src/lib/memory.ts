import { db, getSetting, now, uuid, Row } from "./db";
import { chat, extractFirstJson } from "./nvidia";
import { contentHash, decryptText, encryptText } from "./crypto";
import { redact } from "./secrets";

export type MemoryKind = "episodica" | "semantica" | "preferencia" | "procedimental" | "documental" | "salud";

export const MEMORY_KINDS: MemoryKind[] = [
  "episodica",
  "semantica",
  "preferencia",
  "procedimental",
  "documental",
  "salud",
];

export interface Memory {
  id: string;
  kind: MemoryKind;
  content: string;
  summary: string | null;
  source: string;
  source_ref: string | null;
  provenance: unknown;
  confidence: number;
  status: string;
  sensitive: boolean;
  created_at: string;
  updated_at: string;
  last_used_at: string | null;
  use_count: number;
}

function hydrate(row: Row): Memory {
  const sensitive = Boolean(row.sensitive);
  return {
    id: row.id,
    kind: row.kind,
    content: sensitive ? decryptText(row.content) : row.content,
    summary: row.summary ?? null,
    source: row.source,
    source_ref: row.source_ref ?? null,
    provenance: row.provenance ? JSON.parse(row.provenance) : null,
    confidence: Number(row.confidence),
    status: row.status,
    sensitive,
    created_at: row.created_at,
    updated_at: row.updated_at,
    last_used_at: row.last_used_at ?? null,
    use_count: Number(row.use_count ?? 0),
  };
}

export function addMemory(input: {
  kind: MemoryKind;
  content: string;
  summary?: string;
  source: string;
  sourceRef?: string;
  provenance?: unknown;
  confidence?: number;
  sensitive?: boolean;
  status?: string;
}): Memory {
  const content = input.content.trim().slice(0, 6000);
  if (!content) throw new Error("La memoria está vacía");
  const hash = contentHash(content);
  const existing = db().prepare("SELECT * FROM memories WHERE hash = ? AND kind = ?").get(hash, input.kind) as Row | undefined;
  if (existing) {
    db()
      .prepare("UPDATE memories SET confidence = MAX(confidence, ?), updated_at = ?, status = 'activa' WHERE id = ?")
      .run(input.confidence ?? 0.7, now(), existing.id);
    return hydrate(db().prepare("SELECT * FROM memories WHERE id = ?").get(existing.id) as Row);
  }

  const id = uuid();
  const ts = now();
  const sensitive = Boolean(input.sensitive);
  const stored = sensitive ? encryptText(content) : content;
  db()
    .prepare(
      "INSERT INTO memories(id, kind, content, summary, source, source_ref, provenance, confidence, status, sensitive, created_at, updated_at, hash) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
    )
    .run(
      id,
      input.kind,
      stored,
      (input.summary ?? content).slice(0, 400),
      input.source,
      input.sourceRef ?? null,
      JSON.stringify(input.provenance ?? {}),
      input.confidence ?? 0.7,
      input.status ?? "activa",
      sensitive ? 1 : 0,
      ts,
      ts,
      hash,
    );
  if (!sensitive) {
    db().prepare("INSERT INTO memories_fts(content, summary, memory_id) VALUES(?,?,?)").run(content, input.summary ?? content.slice(0, 400), id);
  }
  return getMemory(id)!;
}

export function getMemory(id: string): Memory | null {
  const row = db().prepare("SELECT * FROM memories WHERE id = ?").get(id) as Row | undefined;
  return row ? hydrate(row) : null;
}

export function listMemories(opts?: { kind?: string; q?: string; includeForgotten?: boolean; limit?: number }): Memory[] {
  const where: string[] = [];
  const params: any[] = [];
  if (!opts?.includeForgotten) where.push("status != 'olvidada'");
  if (opts?.kind && opts.kind !== "todas") {
    where.push("kind = ?");
    params.push(opts.kind);
  }
  if (opts?.q) {
    where.push("(content LIKE ? OR summary LIKE ?)");
    params.push(`%${opts.q}%`, `%${opts.q}%`);
  }
  const sql = `SELECT * FROM memories ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY updated_at DESC LIMIT ?`;
  params.push(opts?.limit ?? 200);
  return (db().prepare(sql).all(...params) as Row[]).map(hydrate);
}

export function searchMemories(query: string, limit = 20): Memory[] {
  const terms = query
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2)
    .slice(0, 8);
  if (terms.length === 0) return [];
  try {
    const rows = db()
      .prepare(
        "SELECT m.* FROM memories_fts f JOIN memories m ON m.id = f.memory_id WHERE memories_fts MATCH ? ORDER BY bm25(memories_fts) LIMIT ?",
      )
      .all(terms.map((t) => `${t}*`).join(" OR "), limit) as Row[];
    return rows.map(hydrate);
  } catch {
    return [];
  }
}

export function touchMemory(id: string) {
  db().prepare("UPDATE memories SET last_used_at = ?, use_count = use_count + 1 WHERE id = ?").run(now(), id);
}

export function forgetMemory(id: string): boolean {
  const exists = db().prepare("SELECT id FROM memories WHERE id = ?").get(id);
  if (!exists) return false;
  db().prepare("DELETE FROM memories_fts WHERE memory_id = ?").run(id);
  db().prepare("DELETE FROM memories WHERE id = ?").run(id);
  return true;
}

export function forgetMatching(query: string): number {
  const matches = searchMemories(query, 100);
  let removed = 0;
  for (const m of matches) if (forgetMemory(m.id)) removed++;
  return removed;
}

export function correctMemory(id: string, content: string): Memory {
  const current = getMemory(id);
  if (!current) throw new Error("Memoria no encontrada");
  const ts = now();
  db().prepare("UPDATE memories SET content = ?, summary = ?, updated_at = ?, status = 'activa' WHERE id = ?").run(
    current.sensitive ? encryptText(content) : content,
    content.slice(0, 400),
    ts,
    id,
  );
  if (!current.sensitive) {
    db().prepare("DELETE FROM memories_fts WHERE memory_id = ?").run(id);
    db().prepare("INSERT INTO memories_fts(content, summary, memory_id) VALUES(?,?,?)").run(content, content.slice(0, 400), id);
  }
  return getMemory(id)!;
}

export function setPreference(key: string, value: string, source = "usuario", confidence = 0.9) {
  db()
    .prepare(
      "INSERT INTO preferences(key, value, confidence, source, updated_at) VALUES(?,?,?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, confidence=excluded.confidence, source=excluded.source, updated_at=excluded.updated_at",
    )
    .run(key, value.slice(0, 2000), confidence, source, now());
}

export function listPreferences(): Array<{ key: string; value: string; confidence: number; source: string; updated_at: string }> {
  return db().prepare("SELECT * FROM preferences ORDER BY updated_at DESC").all() as any[];
}

/** Consolida: elimina duplicados por hash y marca como olvidadas las memorias débiles y sin uso. */
export function consolidateMemories(): { duplicados: number; olvidadas: number } {
  const rows = db().prepare("SELECT id, hash, kind, confidence, last_used_at, updated_at FROM memories").all() as Row[];
  const seen = new Map<string, string>();
  let duplicados = 0;
  for (const row of rows) {
    const key = `${row.kind}:${row.hash}`;
    const first = seen.get(key);
    if (first) {
      db().prepare("DELETE FROM memories WHERE id = ?").run(row.id);
      db().prepare("DELETE FROM memories_fts WHERE memory_id = ?").run(row.id);
      duplicados++;
    } else {
      seen.set(key, row.id);
    }
  }
  const cutoff = new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString();
  const result = db()
    .prepare(
      "UPDATE memories SET status = 'olvidada' WHERE confidence < 0.45 AND (last_used_at IS NULL OR last_used_at < ?) AND updated_at < ? AND status = 'activa'",
    )
    .run(cutoff, cutoff);
  return { duplicados, olvidadas: Number(result.changes ?? 0) };
}

export interface LearnedFact {
  tipo: MemoryKind;
  contenido: string;
  sensible: boolean;
  confianza: number;
}

/** Extrae recuerdos duraderos de un intercambio. No guarda todo: solo lo reutilizable. */
export async function learnFromExchange(input: {
  question: string;
  answer: string;
  tools: Array<{ herramienta: string; resumen: string }>;
  conversationId: string;
}): Promise<Memory[]> {
  if (getSetting("memoria_automatica", "true") !== "true") return [];
  const result = await chat({
    thinking: false,
    maxTokens: 700,
    temperature: 0,
    messages: [
      {
        role: "system",
        content: `Eres el módulo de memoria de JARVIS. Decide si del intercambio se desprende algún dato DURADERO sobre el usuario que convenga recordar.
Tipos: episodica (algo que ocurrió), semantica (hecho estable), preferencia (gusto o estilo), procedimental (cómo le gusta que se hagan las cosas), salud (solo si el usuario lo cuenta explícitamente).
NO guardes: preguntas genéricas, resultados de herramientas efímeros, contenido de documentos ya indexados, ni nada que el usuario no haya afirmado.
Devuelve SOLO JSON: {"hechos":[{"tipo":"preferencia","contenido":"...","sensible":false,"confianza":0.8}]}
Si no hay nada duradero, devuelve {"hechos":[]}. Máximo 3.`,
      },
      { role: "user", content: `USUARIO: ${input.question.slice(0, 1500)}\nJARVIS: ${input.answer.slice(0, 2000)}` },
    ],
  });
  let facts: LearnedFact[] = [];
  try {
    const parsed = extractFirstJson(result.content);
    facts = Array.isArray(parsed?.hechos) ? parsed.hechos.slice(0, 3) : [];
  } catch {
    return [];
  }
  const saved: Memory[] = [];
  for (const fact of facts) {
    const kind = MEMORY_KINDS.includes(fact.tipo) ? fact.tipo : "semantica";
    const content = String(fact.contenido ?? "").trim();
    if (content.length < 8) continue;
    try {
      saved.push(
        addMemory({
          kind,
          content,
          source: "conversacion",
          sourceRef: input.conversationId,
          provenance: { conversacion: input.conversationId, herramientas: input.tools.map((t) => t.herramienta) },
          confidence: Math.max(0.4, Math.min(0.95, Number(fact.confianza) || 0.7)),
          sensitive: Boolean(fact.sensible),
        }),
      );
    } catch (err) {
      /* una memoria fallida no debe romper la conversación */
    }
  }
  return saved;
}

export function whatDoYouKnowAboutMe(): {
  memorias: Memory[];
  preferencias: ReturnType<typeof listPreferences>;
  grafo: { nodos: number; relaciones: number };
  porTipo: Array<{ kind: string; total: number }>;
} {
  return {
    memorias: listMemories({ limit: 60 }),
    preferencias: listPreferences(),
    grafo: {
      nodos: Number((db().prepare("SELECT COUNT(*) AS c FROM nodes").get() as Row).c),
      relaciones: Number((db().prepare("SELECT COUNT(*) AS c FROM edges").get() as Row).c),
    },
    porTipo: db().prepare("SELECT kind, COUNT(*) AS total FROM memories GROUP BY kind ORDER BY total DESC").all() as any[],
  };
}

export function explainMemory(id: string) {
  const memory = getMemory(id);
  if (!memory) return null;
  return {
    memoria: memory,
    procedencia: memory.provenance,
    regla: "Creada a partir de una conversación, documento o corrección. Puedes corregirla o eliminarla.",
    fecha: memory.created_at,
  };
}

export function safeSummary(text: string): string {
  return redact(text).slice(0, 300);
}
