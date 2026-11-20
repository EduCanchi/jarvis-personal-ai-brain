import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getAccessToken, isLocalRequest, rotateAccessToken, SESSION_COOKIE, tokenMatches } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const local = isLocalRequest(req.headers);
  const jar = await cookies();
  const session = jar.get(SESSION_COOKIE)?.value;
  return NextResponse.json({
    local,
    autenticado: local || tokenMatches(session),
    requiere_auth: !local,
    token_configurado: Boolean(getAccessToken()),
  });
}

/** Solo desde localhost: muestra o rota el token de acceso remoto. */
export async function POST(req: Request) {
  if (!isLocalRequest(req.headers)) {
    return NextResponse.json({ error: "Solo disponible en local" }, { status: 403 });
  }
  const body = (await req.json().catch(() => ({}))) as { accion?: string };
  if (body.accion === "rotar") {
    return NextResponse.json({ token: rotateAccessToken() });
  }
  return NextResponse.json({ token: getAccessToken() });
}
