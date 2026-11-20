import { NextResponse } from "next/server";
import { SESSION_COOKIE, tokenMatches } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { token?: string };
  if (!tokenMatches(body.token)) {
    return NextResponse.json({ error: "Token incorrecto" }, { status: 401 });
  }
  const secure = new URL(req.url).protocol === "https:";
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, String(body.token), {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
