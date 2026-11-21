import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { dataDir } from "./paths";

const KEYCHAIN_SERVICE = "personal-ai-brain";
const KEYCHAIN_ACCOUNT = "nvidia-api-key";
const FALLBACK_FILE = () => path.join(dataDir(), "secrets.json");

function readFallback(): string | null {
  try {
    const file = FALLBACK_FILE();
    if (!fs.existsSync(file)) return null;
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    return typeof parsed.nvidia_api_key === "string" ? parsed.nvidia_api_key : null;
  } catch {
    return null;
  }
}

function writeFallback(key: string) {
  const file = FALLBACK_FILE();
  fs.writeFileSync(file, JSON.stringify({ nvidia_api_key: key }), { mode: 0o600 });
  fs.chmodSync(file, 0o600);
}

/** Devuelve la API key sin exponerla en logs: entorno, Llavero de macOS o archivo 0600. */
export function getApiKey(): string | null {
  const fromEnv = process.env.NVIDIA_API_KEY?.trim();
  if (fromEnv) return fromEnv;
  try {
    const out = execFileSync(
      "security",
      ["find-generic-password", "-s", KEYCHAIN_SERVICE, "-a", KEYCHAIN_ACCOUNT, "-w"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    ).trim();
    if (out) return out;
  } catch {
    /* no está en el Llavero */
  }
  return readFallback();
}

export function hasApiKey(): boolean {
  return Boolean(getApiKey());
}

export function apiKeySource(): "entorno" | "llavero" | "archivo" | "ninguna" {
  if (process.env.NVIDIA_API_KEY?.trim()) return "entorno";
  try {
    const out = execFileSync(
      "security",
      ["find-generic-password", "-s", KEYCHAIN_SERVICE, "-a", KEYCHAIN_ACCOUNT, "-w"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    ).trim();
    if (out) return "llavero";
  } catch {
    /* ignorado */
  }
  return readFallback() ? "archivo" : "ninguna";
}

export function saveApiKey(key: string): { ok: boolean; store: "llavero" | "archivo" } {
  const clean = key.trim();
  if (!/^nvapi-[A-Za-z0-9_\-]{20,}$/.test(clean)) {
    throw new Error("Formato de clave NVIDIA no válido (debe empezar por nvapi-)");
  }
  try {
    execFileSync(
      "security",
      [
        "add-generic-password",
        "-U",
        "-s",
        KEYCHAIN_SERVICE,
        "-a",
        KEYCHAIN_ACCOUNT,
        "-l",
        "Personal AI Brain — NVIDIA Build",
        "-w",
        clean,
      ],
      { stdio: "ignore" },
    );
    try {
      fs.rmSync(FALLBACK_FILE(), { force: true });
    } catch {
      /* nada */
    }
    return { ok: true, store: "llavero" };
  } catch {
    writeFallback(clean);
    return { ok: true, store: "archivo" };
  }
}

export function deleteApiKey() {
  try {
    execFileSync("security", ["delete-generic-password", "-s", KEYCHAIN_SERVICE, "-a", KEYCHAIN_ACCOUNT], {
      stdio: "ignore",
    });
  } catch {
    /* no existía */
  }
  try {
    fs.rmSync(FALLBACK_FILE(), { force: true });
  } catch {
    /* nada */
  }
}

/** Enmascara cualquier clave que pudiera aparecer en un mensaje de error. */
export function redact(text: string): string {
  return text
    .replace(/nvapi-[A-Za-z0-9_\-]+/g, "nvapi-••••••")
    .replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, "Bearer ••••••");
}


function keychainValue(account: string): string | null {
  try {
    const out = execFileSync(
      "security",
      ["find-generic-password", "-s", KEYCHAIN_SERVICE, "-a", account, "-w"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    ).trim();
    return out || null;
  } catch {
    return null;
  }
}

export function getMagpieKey(): string | null {
  return process.env.MAGPIE_API_KEY?.trim() || keychainValue("magpie-api-key");
}

export function getParakeetKey(): string | null {
  return process.env.PARAKEET_API_KEY?.trim() || keychainValue("parakeet-api-key");
}

export function hasCloudVoiceKeys(): { magpie: boolean; parakeet: boolean } {
  return { magpie: Boolean(getMagpieKey()), parakeet: Boolean(getParakeetKey()) };
}
