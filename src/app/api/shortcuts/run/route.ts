import { askJarvis } from "@/lib/assistant";
import { tokenMatches } from "@/lib/auth";
import { redact } from "@/lib/secrets";
import { getSetting } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Punto de entrada para Atajos de Apple (y automatizaciones externas).
 * Requiere el token de acceso en la cabecera x-paib-token o en el cuerpo.
 * Devuelve texto plano para que el Atajo lo pueda leer o dictar directamente.
 */
export async function POST(req: Request) {
  const started = Date.now();
  try {
    const body = (await req.json().catch(() => ({}))) as { instruccion?: string; token?: string };
    const headerToken = req.headers.get("x-paib-token");
    if (!tokenMatches(headerToken) && !tokenMatches(body.token)) {
      return new Response("No autorizado", { status: 401 });
    }
    const instruccion = String(body.instruccion ?? "").trim().slice(0, 1000);
    if (!instruccion) return new Response("Falta la instrucción", { status: 400 });

    const result = await askJarvis({ question: instruccion, conversationId: null, origin: "texto" });
    const texto = result.answer;
    return new Response(texto, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "X-PAIB-Tools": String(result.tools.length),
        "X-PAIB-Ms": String(Date.now() - started),
        "X-PAIB-Voice": getSetting("voz_tts", "Mónica"),
      },
    });
  } catch (err: any) {
    return new Response(redact(String(err?.message ?? err)), { status: 500 });
  }
}

export async function GET() {
  return new Response(
    "POST {instruccion} con la cabecera x-paib-token. Ejemplo:\ncurl -X POST http://127.0.0.1:4317/api/shortcuts/run -H 'x-paib-token: TOKEN' -H 'Content-Type: application/json' -d '{\"instruccion\":\"¿qué tengo mañana?\"}'",
    { headers: { "Content-Type": "text/plain; charset=utf-8" } },
  );
}
