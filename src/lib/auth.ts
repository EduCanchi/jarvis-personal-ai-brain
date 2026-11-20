import fs from "node:fs";
import path from "node:path";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { dataDir } from "./paths";

const FILE = () => path.join(dataDir(), "access-token.txt");

export function getAccessToken(): string {
  try {
    const existing = fs.readFileSync(FILE(), "utf8").trim();
    if (existing.length >= 24) return existing;
  } catch {
    /* se genera */
  }
  const token = randomBytes(24).toString("base64url");
  fs.writeFileSync(FILE(), token, { mode: 0o600 });
  fs.chmodSync(FILE(), 0o600);
  return token;
}

export function rotateAccessToken(): string {
  const token = randomBytes(24).toString("base64url");
  fs.writeFileSync(FILE(), token, { mode: 0o600 });
  fs.chmodSync(FILE(), 0o600);
  return token;
}

export function tokenMatches(candidate: string | null | undefined): boolean {
  if (!candidate) return false;
  const expected = getAccessToken();
  const a = Buffer.from(String(candidate));
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function isLoopbackHost(host: string | null): boolean {
  if (!host) return false;
  const lower = host.toLowerCase();
  const name = lower.startsWith("[") ? lower.slice(1, lower.indexOf("]")) : lower.split(":")[0];
  return name === "127.0.0.1" || name === "localhost" || name === "::1" || name === "0.0.0.0";
}

/** Considera local solo si ni el Host ni las cabeceras de proxy apuntan fuera. */
export function isLocalRequest(headers: Headers): boolean {
  const forwarded = headers.get("x-forwarded-for") ?? headers.get("x-real-ip");
  if (forwarded) {
    const first = forwarded.split(",")[0].trim();
    if (first && !isLoopbackHost(first)) return false;
  }
  return isLoopbackHost(headers.get("host"));
}

export const SESSION_COOKIE = "paib_session";
