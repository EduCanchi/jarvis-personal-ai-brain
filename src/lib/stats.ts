import fs from "node:fs";
import { db, Row } from "./db";
import { dbPath, dataDir } from "./paths";
import { getApiKey, apiKeySource } from "./secrets";
import { inFlight } from "./nvidia";
import { modelId } from "./models";

function count(sql: string): number {
  return Number((db().prepare(sql).get() as Row)?.c ?? 0);
}

export function stats() {
  const docs = count("SELECT COUNT(*) AS c FROM documents");
  const processed = count("SELECT COUNT(*) AS c FROM documents WHERE status = 'procesado'");
  const errors = count("SELECT COUNT(*) AS c FROM documents WHERE status = 'error'");
  const chunks = count("SELECT COUNT(*) AS c FROM chunks");
  const nodes = count("SELECT COUNT(*) AS c FROM nodes");
  const edges = count("SELECT COUNT(*) AS c FROM edges");
  const pendingEdges = count("SELECT COUNT(*) AS c FROM edges WHERE status = 'pendiente'");
  const conversations = count("SELECT COUNT(*) AS c FROM conversations");
  const messages = count("SELECT COUNT(*) AS c FROM messages");
  const queued = count("SELECT COUNT(*) AS c FROM jobs WHERE status IN ('en_cola','procesando')");

  let dbSize = 0;
  try {
    dbSize = fs.statSync(dbPath()).size;
  } catch {
    /* nada */
  }

  const recentDocs = db()
    .prepare("SELECT id, name, ext, status, added_at, size FROM documents ORDER BY added_at DESC LIMIT 6")
    .all() as Row[];
  const recentEvents = db()
    .prepare("SELECT id, level, kind, message, created_at FROM events ORDER BY id DESC LIMIT 12")
    .all() as Row[];
  const jobs = db()
    .prepare("SELECT j.*, d.name AS doc_name FROM jobs j LEFT JOIN documents d ON d.id = j.doc_id ORDER BY j.created_at DESC LIMIT 10")
    .all() as Row[];
  const types = db().prepare("SELECT type, COUNT(*) AS c FROM nodes GROUP BY type ORDER BY c DESC").all() as Row[];

  const memory = process.memoryUsage();
  return {
    documentos: docs,
    procesados: processed,
    errores: errors,
    fragmentos: chunks,
    nodos: nodes,
    relaciones: edges,
    relaciones_pendientes: pendingEdges,
    conversaciones: conversations,
    mensajes: messages,
    trabajos_en_cola: queued,
    tamano_db: dbSize,
    tipos: types,
    recientes: recentDocs,
    eventos: recentEvents,
    trabajos: jobs,
    sistema: {
      clave_configurada: Boolean(getApiKey()),
      clave_origen: apiKeySource(),
      modelo_principal: modelId("principal"),
      modelo_vision: modelId("vision"),
      modelo_embeddings: modelId("embeddings"),
      peticiones_activas: inFlight(),
      memoria_rss_mb: Math.round(memory.rss / 1024 / 1024),
      heap_mb: Math.round(memory.heapUsed / 1024 / 1024),
      directorio_datos: dataDir(),
    },
  };
}
