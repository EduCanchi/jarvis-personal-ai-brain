import fs from "node:fs/promises";
import path from "node:path";
import { db, logEvent, now, uuid, Row } from "./db";
import { addDocument, ALLOWED_EXT, MAX_BYTES } from "./documents";
import { redact } from "./secrets";

export interface Connector {
  id: string;
  kind: string;
  name: string;
  config: string;
  status: string;
  last_sync: string | null;
  error: string | null;
  created_at: string;
}

export function listConnectors(): Connector[] {
  return db().prepare("SELECT * FROM connectors ORDER BY created_at").all() as unknown as Connector[];
}

export function addLocalFolder(folder: string): Connector {
  const resolved = path.resolve(folder);
  if (!resolved.startsWith("/")) throw new Error("Ruta inválida");
  const id = uuid();
  db()
    .prepare("INSERT INTO connectors(id, kind, name, config, status, created_at) VALUES(?,?,?,?,?,?)")
    .run(id, "carpeta_local", path.basename(resolved), JSON.stringify({ path: resolved }), "activo", now());
  logEvent("info", "conectores", `Carpeta local conectada: ${resolved}`);
  return db().prepare("SELECT * FROM connectors WHERE id = ?").get(id) as unknown as Connector;
}

export function deleteConnector(id: string) {
  db().prepare("DELETE FROM connectors WHERE id = ?").run(id);
}

async function* walk(dir: string, depth = 0): AsyncGenerator<string> {
  if (depth > 6) return;
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full, depth + 1);
    } else if (entry.isFile()) {
      yield full;
    }
  }
}

export async function scanConnector(id: string): Promise<{ added: number; duplicates: number; skipped: number; errors: string[] }> {
  const connector = db().prepare("SELECT * FROM connectors WHERE id = ?").get(id) as Row | undefined;
  if (!connector) throw new Error("Conector no encontrado");
  const config = JSON.parse(connector.config ?? "{}");
  if (!config.path) throw new Error("El conector no tiene una ruta configurada");

  const stats = { added: 0, duplicates: 0, skipped: 0, errors: [] as string[] };
  const limit = 300;
  let seen = 0;

  try {
    const info = await fs.stat(config.path);
    if (!info.isDirectory()) throw new Error("La ruta no es una carpeta");
  } catch (err: any) {
    db().prepare("UPDATE connectors SET status = 'error', error = ? WHERE id = ?").run(
      redact(String(err?.message ?? err)),
      id,
    );
    throw new Error(`No se puede leer la carpeta: ${redact(String(err?.message ?? err))}`);
  }

  for await (const file of walk(config.path)) {
    if (seen >= limit) break;
    const ext = path.extname(file).toLowerCase().replace(/^\./, "");
    if (!ALLOWED_EXT.has(ext)) {
      stats.skipped++;
      continue;
    }
    try {
      const stat = await fs.stat(file);
      if (stat.size === 0 || stat.size > MAX_BYTES) {
        stats.skipped++;
        continue;
      }
      const buffer = await fs.readFile(file);
      const result = await addDocument({ buffer, name: path.basename(file), origin: `carpeta:${config.path}` });
      if (result.duplicate) stats.duplicates++;
      else stats.added++;
      seen++;
    } catch (err: any) {
      stats.errors.push(`${path.basename(file)}: ${redact(String(err?.message ?? err))}`);
      stats.skipped++;
    }
  }

  db()
    .prepare("UPDATE connectors SET status = 'activo', last_sync = ?, error = ? WHERE id = ?")
    .run(now(), stats.errors.length ? stats.errors.slice(0, 3).join(" · ") : null, id);
  logEvent("info", "conectores", `Sincronización de ${connector.name}`, stats);
  return stats;
}
