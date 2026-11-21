import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { db, logEvent, now, Row } from "./db";
import { createBackup } from "./backup";
import { dataDir } from "./paths";

export interface ResetReport {
  respaldo: { file: string; size: number; verificado: boolean; detalle: string };
  eliminado: Record<string, number>;
  conservado: string[];
  fecha: string;
}

function verifyBackup(file: string): { ok: boolean; detalle: string } {
  const temp = fs.mkdtempSync(path.join(dataDir(), "verify-"));
  try {
    execFileSync("tar", ["-xzf", file, "-C", temp], { stdio: "ignore" });
    const dbFile = path.join(temp, "brain.db");
    if (!fs.existsSync(dbFile)) return { ok: false, detalle: "El respaldo no contiene brain.db" };
    const check = new DatabaseSync(dbFile);
    const result = check.prepare("PRAGMA integrity_check").get() as Row;
    const docs = check.prepare("SELECT COUNT(*) AS c FROM documents").get() as Row;
    check.close();
    const integrity = String(Object.values(result)[0] ?? "");
    if (integrity !== "ok") return { ok: false, detalle: `integrity_check: ${integrity}` };
    return { ok: true, detalle: `Integridad correcta · ${docs.c} documento(s) en el respaldo` };
  } catch (err: any) {
    return { ok: false, detalle: String(err?.message ?? err) };
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

function count(sql: string): number {
  return Number((db().prepare(sql).get() as Row)?.c ?? 0);
}

/**
 * Reinicia las memorias personales conservando código, modelos, configuración,
 * credenciales y el registro de seguridad. Crea y verifica un respaldo antes.
 */
export async function resetMemory(): Promise<ResetReport> {
  const backup = createBackup();
  const verification = verifyBackup(backup.file);
  if (!verification.ok) {
    throw new Error(`Respaldo no verificado (${verification.detalle}); no se borra nada`);
  }

  const eliminado: Record<string, number> = {
    documentos: count("SELECT COUNT(*) AS c FROM documents"),
    fragmentos: count("SELECT COUNT(*) AS c FROM chunks"),
    embeddings: count("SELECT COUNT(*) AS c FROM embeddings"),
    nodos: count("SELECT COUNT(*) AS c FROM nodes"),
    relaciones: count("SELECT COUNT(*) AS c FROM edges"),
    conversaciones: count("SELECT COUNT(*) AS c FROM conversations"),
    mensajes: count("SELECT COUNT(*) AS c FROM messages"),
    artefactos: count("SELECT COUNT(*) AS c FROM artifacts"),
    notas: count("SELECT COUNT(*) AS c FROM notes"),
    automatizaciones: count("SELECT COUNT(*) AS c FROM automations"),
    ejecuciones_herramientas: count("SELECT COUNT(*) AS c FROM tool_runs"),
    notificaciones: count("SELECT COUNT(*) AS c FROM notifications"),
    eventos: count("SELECT COUNT(*) AS c FROM events"),
    memorias: count("SELECT COUNT(*) AS c FROM memories"),
    preferencias: count("SELECT COUNT(*) AS c FROM preferences"),
    estudios_salud: count("SELECT COUNT(*) AS c FROM health_studies"),
    resultados_salud: count("SELECT COUNT(*) AS c FROM health_results"),
    correos: count("SELECT COUNT(*) AS c FROM emails"),
    estilo_correo: count("SELECT COUNT(*) AS c FROM email_style"),
  };

  const conn = db();
  conn.exec("BEGIN");
  try {
    conn.exec("DELETE FROM chunks_fts");
    conn.exec("DELETE FROM memories_fts");
    for (const table of [
      "embeddings",
      "memories",
      "preferences",
      "health_results",
      "health_studies",
      "emails",
      "email_style",
      "chunks",
      "edges",
      "nodes",
      "messages",
      "conversations",
      "documents",
      "artifacts",
      "notes",
      "automations",
      "tool_runs",
      "notifications",
      "events",
    ]) {
      conn.exec(`DELETE FROM ${table}`);
    }
    conn.exec("COMMIT");
  } catch (err) {
    conn.exec("ROLLBACK");
    throw err;
  }

  // Borra los archivos originales y los artefactos generados (ya están en el respaldo).
  await fsp.rm(path.join(dataDir(), "uploads"), { recursive: true, force: true });
  await fsp.rm(path.join(dataDir(), "artifacts"), { recursive: true, force: true });
  await fsp.mkdir(path.join(dataDir(), "uploads"), { recursive: true });
  await fsp.mkdir(path.join(dataDir(), "artifacts"), { recursive: true });

  logEvent("warn", "memoria", "Reinicio de memoria personal ejecutado", {
    respaldo: path.basename(backup.file),
    eliminado,
  });

  return {
    respaldo: {
      file: backup.file,
      size: backup.size,
      verificado: verification.ok,
      detalle: verification.detalle,
    },
    eliminado,
    conservado: [
      "código y modelos",
      "clave NVIDIA y token de acceso",
      "configuración de voz y modelos",
      "permisos y registro de seguridad",
    ],
    fecha: now(),
  };
}
