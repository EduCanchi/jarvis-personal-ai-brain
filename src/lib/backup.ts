import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { db, logEvent } from "./db";
import { backupsDir, dataDir, dbPath, uploadsDir } from "./paths";

export interface BackupInfo {
  file: string;
  size: number;
  created_at: string;
}

export function listBackups(): BackupInfo[] {
  const dir = backupsDir();
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".tar.gz"))
    .map((f) => {
      const full = path.join(dir, f);
      const stat = fs.statSync(full);
      return { file: full, size: stat.size, created_at: stat.mtime.toISOString() };
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function createBackup(): BackupInfo {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const target = path.join(backupsDir(), `personal-ai-brain-${stamp}.tar.gz`);
  const temp = fs.mkdtempSync(path.join(dataDir(), "backup-tmp-"));
  try {
    const snapshot = path.join(temp, "snapshot.db");
    db().exec(`VACUUM INTO '${snapshot.replace(/'/g, "''")}'`);
    fs.renameSync(snapshot, path.join(temp, "brain.db"));

    const manifest = {
      app: "Personal AI Brain",
      version: 1,
      created_at: new Date().toISOString(),
      documents: (db().prepare("SELECT COUNT(*) AS c FROM documents").get() as any).c,
      nodes: (db().prepare("SELECT COUNT(*) AS c FROM nodes").get() as any).c,
      edges: (db().prepare("SELECT COUNT(*) AS c FROM edges").get() as any).c,
    };
    fs.writeFileSync(path.join(temp, "manifest.json"), JSON.stringify(manifest, null, 2));

    fs.symlinkSync(uploadsDir(), path.join(temp, "uploads"));
    execFileSync("tar", ["-czhf", target, "-C", temp, "."], { stdio: "ignore" });
    logEvent("info", "respaldo", `Respaldo creado: ${path.basename(target)}`);
    const stat = fs.statSync(target);
    return { file: target, size: stat.size, created_at: stat.mtime.toISOString() };
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

/** Restaura un respaldo. Cierra y reabre la base de datos; requiere reiniciar trabajos en curso. */
export async function restoreBackup(file: string, confirm: boolean): Promise<{ ok: boolean; message: string }> {
  if (!confirm) throw new Error("La restauración requiere confirmación explícita");
  const resolved = path.resolve(file);
  if (!resolved.startsWith(backupsDir() + path.sep)) throw new Error("Solo se pueden restaurar respaldos del directorio de respaldos");
  if (!fs.existsSync(resolved)) throw new Error("El respaldo no existe");

  const temp = fs.mkdtempSync(path.join(dataDir(), "restore-tmp-"));
  try {
    execFileSync("tar", ["-xzf", resolved, "-C", temp], { stdio: "ignore" });
    if (!fs.existsSync(path.join(temp, "brain.db"))) throw new Error("Respaldo inválido: falta brain.db");
    const manifestPath = path.join(temp, "manifest.json");
    if (fs.existsSync(manifestPath)) {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      if (manifest.app !== "Personal AI Brain") throw new Error("El respaldo pertenece a otra aplicación");
    }

    const safety = createBackup();

    const g = globalThis as unknown as { __paibDb?: any };
    if (g.__paibDb) {
      try {
        g.__paibDb.close();
      } catch {
        /* nada */
      }
      g.__paibDb = undefined;
    }
    for (const suffix of ["", "-wal", "-shm"]) {
      fs.rmSync(dbPath() + suffix, { force: true });
    }
    fs.copyFileSync(path.join(temp, "brain.db"), dbPath());
    await fsp.rm(uploadsDir(), { recursive: true, force: true });
    await fsp.mkdir(uploadsDir(), { recursive: true });
    const restoredUploads = path.join(temp, "uploads");
    if (fs.existsSync(restoredUploads)) {
      await fsp.cp(restoredUploads, uploadsDir(), { recursive: true });
    }
    logEvent("warn", "respaldo", `Base restaurada desde ${path.basename(resolved)}`, {
      respaldo_previo: path.basename(safety.file),
    });
    return { ok: true, message: `Restaurado. Copia de seguridad previa: ${path.basename(safety.file)}` };
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}
