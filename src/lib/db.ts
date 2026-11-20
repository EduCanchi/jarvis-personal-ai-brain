import { DatabaseSync } from "node:sqlite";
import { dbPath } from "./paths";
import { randomUUID } from "node:crypto";

export type Row = Record<string, any>;

const globalForDb = globalThis as unknown as { __paibDb?: DatabaseSync };

const SCHEMA = `
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  ext TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL DEFAULT 0,
  hash TEXT UNIQUE,
  stored_path TEXT NOT NULL,
  origin TEXT NOT NULL DEFAULT 'local',
  status TEXT NOT NULL DEFAULT 'pendiente',
  error TEXT,
  pages INTEGER,
  chars INTEGER,
  added_at TEXT NOT NULL,
  processed_at TEXT,
  excluded_remote INTEGER NOT NULL DEFAULT 0,
  meta TEXT
);

CREATE TABLE IF NOT EXISTS chunks (
  id TEXT PRIMARY KEY,
  doc_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  idx INTEGER NOT NULL,
  kind TEXT NOT NULL DEFAULT 'texto',
  page INTEGER,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chunks_doc ON chunks(doc_id);

CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
  content,
  chunk_id UNINDEXED,
  tokenize='unicode61 remove_diacritics 2'
);

CREATE TABLE IF NOT EXISTS embeddings (
  chunk_id TEXT PRIMARY KEY REFERENCES chunks(id) ON DELETE CASCADE,
  model TEXT NOT NULL,
  dim INTEGER NOT NULL,
  vector BLOB NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS nodes (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  norm TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'inferido',
  confidence REAL NOT NULL DEFAULT 0.6,
  origin TEXT NOT NULL DEFAULT 'ia',
  doc_ids TEXT NOT NULL DEFAULT '[]',
  meta TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(type, norm)
);
CREATE INDEX IF NOT EXISTS idx_nodes_type ON nodes(type);

CREATE TABLE IF NOT EXISTS edges (
  id TEXT PRIMARY KEY,
  from_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  to_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  relation TEXT NOT NULL,
  evidence TEXT,
  confidence REAL NOT NULL DEFAULT 0.6,
  origin TEXT NOT NULL DEFAULT 'ia',
  status TEXT NOT NULL DEFAULT 'pendiente',
  doc_id TEXT,
  chunk_id TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(from_id, to_id, relation)
);
CREATE INDEX IF NOT EXISTS idx_edges_from ON edges(from_id);
CREATE INDEX IF NOT EXISTS idx_edges_to ON edges(to_id);

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  reasoning TEXT,
  citations TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id);

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  doc_id TEXT,
  type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'en_cola',
  progress INTEGER NOT NULL DEFAULT 0,
  step TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  level TEXT NOT NULL DEFAULT 'info',
  kind TEXT NOT NULL,
  message TEXT NOT NULL,
  meta TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS connectors (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  config TEXT,
  status TEXT NOT NULL DEFAULT 'inactivo',
  last_sync TEXT,
  error TEXT,
  created_at TEXT NOT NULL
);
`;

export function db(): DatabaseSync {
  if (!globalForDb.__paibDb) {
    const conn = new DatabaseSync(dbPath());
    conn.exec("PRAGMA journal_mode = WAL");
    conn.exec("PRAGMA foreign_keys = ON");
    conn.exec("PRAGMA busy_timeout = 5000");
    conn.exec(SCHEMA);
    globalForDb.__paibDb = conn;
    seedSettings(conn);
  }
  return globalForDb.__paibDb;
}

function seedSettings(conn: DatabaseSync) {
  const defaults: Record<string, string> = {
    modelo_principal: "nvidia/nemotron-3-ultra-550b-a55b",
    modelo_vision: "nvidia/nemotron-3.5-super-vl-120b-a12b",
    modelo_embeddings: "nvidia/nemotron-3.5-embed-8b",
    razonamiento_visible: "true",
    max_tokens: "8192",
    temperatura: "0.3",
    tamano_fragmento: "1400",
    solapamiento_fragmento: "200",
    concurrencia: "2",
    procesamiento_remoto: "true",
    retencion_dias: "0",
    tema: "oscuro",
  };
  const stmt = conn.prepare("INSERT OR IGNORE INTO settings(key, value) VALUES(?, ?)");
  for (const [k, v] of Object.entries(defaults)) stmt.run(k, v);
}

export function uuid(): string {
  return randomUUID();
}

export function now(): string {
  return new Date().toISOString();
}

export function getSetting(key: string, fallback = ""): string {
  const row = db().prepare("SELECT value FROM settings WHERE key = ?").get(key) as Row | undefined;
  return row?.value ?? fallback;
}

export function setSetting(key: string, value: string) {
  db().prepare(
    "INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).run(key, value);
}

export function logEvent(level: "info" | "warn" | "error", kind: string, message: string, meta?: unknown) {
  try {
    db()
      .prepare("INSERT INTO events(level, kind, message, meta, created_at) VALUES(?, ?, ?, ?, ?)")
      .run(level, kind, message.slice(0, 2000), meta ? JSON.stringify(meta).slice(0, 4000) : null, now());
  } catch {
    /* el log nunca debe romper la petición */
  }
}

export function tx<T>(fn: () => T): T {
  const conn = db();
  conn.exec("BEGIN");
  try {
    const out = fn();
    conn.exec("COMMIT");
    return out;
  } catch (err) {
    conn.exec("ROLLBACK");
    throw err;
  }
}
