import { NextRequest, NextResponse } from "next/server";
import { isLocalRequest, SESSION_COOKIE, tokenMatches } from "@/lib/auth";

const PUBLIC = [
  "/login",
  "/api/auth/login",
  "/api/auth/status",
  "/manifest.webmanifest",
  "/sw.js",
  "/icon.svg",
  "/apple-touch-icon.png",
  "/favicon.ico",
];

export function proxy(req: NextRequest) {
  if (isLocalRequest(req.headers)) return NextResponse.next();

  const { pathname } = req.nextUrl;
  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return NextResponse.next();

  const cookie = req.cookies.get(SESSION_COOKIE)?.value;
  const header = req.headers.get("x-paib-token");
  if (tokenMatches(cookie) || tokenMatches(header)) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: "No autorizado. Inicia sesión con tu token de acceso.", requiere_auth: true },
      { status: 401 },
    );
  }

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
