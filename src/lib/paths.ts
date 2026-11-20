import path from "node:path";
import os from "node:os";
import fs from "node:fs";

export const APP_NAME = "Personal AI Brain";

export function dataDir(): string {
  const override = process.env.PAIB_DATA_DIR;
  const dir =
    override && override.trim().length > 0
      ? path.resolve(override)
      : path.join(os.homedir(), "Library", "Application Support", "PersonalAIBrain");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function uploadsDir(): string {
  const dir = path.join(dataDir(), "uploads");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function backupsDir(): string {
  const dir = path.join(dataDir(), "backups");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function dbPath(): string {
  return path.join(dataDir(), "brain.db");
}

export function cacheDir(): string {
  const dir = path.join(dataDir(), "cache");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** Resuelve un archivo dentro de uploads y bloquea path traversal. */
export function safeUploadPath(relative: string): string {
  const base = uploadsDir();
  const resolved = path.resolve(base, relative);
  if (!resolved.startsWith(base + path.sep)) {
    throw new Error("Ruta de archivo no permitida");
  }
  return resolved;
}
