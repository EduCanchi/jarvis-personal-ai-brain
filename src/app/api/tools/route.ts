import { db, Row } from "@/lib/db";
import { handleError, ok, readJson } from "@/lib/http";
import { listTools, runTool } from "@/lib/tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

export async function GET() {
  try {
    const tools = listTools().map((tool) => ({
      nombre: tool.nombre,
      descripcion: tool.descripcion,
      parametros: tool.parametros,
      permisos: tool.permisos,
      riesgo: tool.riesgo,
      requiere_confirmacion: tool.requiere_confirmacion,
      estado: tool.estado(),
    }));
    const runs = db()
      .prepare("SELECT id, tool, status, origin, duration_ms, created_at, error FROM tool_runs ORDER BY created_at DESC LIMIT 40")
      .all() as Row[];
    const artifacts = db()
      .prepare("SELECT id, name, mime, size, tool, created_at FROM artifacts ORDER BY created_at DESC LIMIT 40")
      .all() as Row[];
    return ok({ tools, runs, artifacts });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: Request) {
  try {
    const body = await readJson<{
      nombre?: string;
      argumentos?: Record<string, any>;
      confirmado?: boolean;
      origen?: "texto" | "voz" | "automatizacion";
    }>(req);
    if (!body.nombre) throw new Error('Falta "nombre"');
    const result = await runTool(body.nombre, body.argumentos ?? {}, {
      origin: body.origen ?? "texto",
      confirmed: body.confirmado === true,
    });
    return ok(result);
  } catch (err) {
    return handleError(err);
  }
}
