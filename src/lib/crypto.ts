import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";
import { dataDir } from "./paths";

const SERVICE = "personal-ai-brain";
const ACCOUNT = "memory-key";
const FILE = () => path.join(dataDir(), "memory.key");

function readKey(): Buffer | null {
  try {
    const fromKeychain = execFileSync(
      "security",
      ["find-generic-password", "-s", SERVICE, "-a", ACCOUNT, "-w"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    ).trim();
    if (fromKeychain) return Buffer.from(fromKeychain, "base64");
  } catch {
    /* no está en el Llavero */
  }
  try {
    const raw = fs.readFileSync(FILE(), "utf8").trim();
    if (raw) return Buffer.from(raw, "base64");
  } catch {
    /* no existe */
  }
  return null;
}

function ensureKey(): Buffer {
  const existing = readKey();
  if (existing && existing.length === 32) return existing;
  const key = randomBytes(32);
  const encoded = key.toString("base64");
  try {
    execFileSync(
      "security",
      ["add-generic-password", "-U", "-s", SERVICE, "-a", ACCOUNT, "-l", "Personal AI Brain — clave de memorias", "-w", encoded],
      { stdio: "ignore" },
    );
    return key;
  } catch {
    fs.writeFileSync(FILE(), encoded, { mode: 0o600 });
    fs.chmodSync(FILE(), 0o600);
    return key;
  }
}

export function encryptText(plain: string): string {
  const key = ensureKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${data.toString("base64")}`;
}

export function decryptText(payload: string): string {
  if (!payload?.startsWith("v1:")) return payload ?? "";
  const [, ivB64, tagB64, dataB64] = payload.split(":");
  const key = ensureKey();
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
}

export function contentHash(text: string): string {
  return createHash("sha256").update(text.trim().toLowerCase().replace(/\s+/g, " ")).digest("hex");
}
