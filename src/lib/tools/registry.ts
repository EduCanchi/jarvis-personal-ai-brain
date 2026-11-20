import fs from "node:fs/promises";
import path from "node:path";
import { artifactsDir } from "../paths";
import { db, now, uuid } from "../db";

export type ToolRisk = "bajo" | "medio" | "alto";

export interface ToolParam {
  tipo: "texto" | "numero" | "booleano" | "lista" | "objeto";
  descripcion: string;
  obligatorio?: boolean;
}

export interface ToolContext {
  origin: "texto" | "voz" | "automatizacion";
  conversationId?: string | null;
  confirmed?: boolean;
}

export interface ToolResult {
  ok: boolean;
  resumen: string;
  datos?: unknown;
  artefactos?: Array<{ id: string; name: string; url: string }>;
  error?: string;
  requiere_confirmacion?: boolean;
}

export interface ToolDef {
  nombre: string;
  descripcion: string;
  parametros: Record<string, ToolParam>;
  permisos: string[];
  riesgo: ToolRisk;
  requiere_confirmacion: boolean;
  estado: () => { conectada: boolean; detalle: string };
  ejecutar: (args: Record<string, any>, ctx: ToolContext) => Promise<ToolResult>;
}

const registry = new Map<string, ToolDef>();

export function registerTool(tool: ToolDef) {
  registry.set(tool.nombre, tool);
}

export function getTool(name: string): ToolDef | undefined {
  return registry.get(name);
}

export function listTools(): ToolDef[] {
  return [...registry.values()];
}

export function toolsForPrompt(): string {
  return listTools()
    .map((tool) => {
      const params = Object.entries(tool.parametros)
        .map(([key, p]) => `${key}${p.obligatorio ? "*" : ""}:${p.tipo}`)
        .join(", ");
      return `- ${tool.nombre}(${params}) → ${tool.descripcion} [riesgo ${tool.riesgo}${tool.requiere_confirmacion ? ", requiere confirmación" : ""}]`;
    })
    .join("\n");
}

export async function saveArtifact(input: {
  name: string;
  mime: string;
  buffer: Buffer;
  tool: string;
}): Promise<{ id: string; name: string; url: string }> {
  const dir = artifactsDir();
  await fs.mkdir(dir, { recursive: true });
  const id = uuid();
  const safe = input.name.replace(/[^\p{L}\p{N}._ -]/gu, "_").slice(0, 120);
  const file = path.join(dir, `${id}-${safe}`);
  await fs.writeFile(file, input.buffer);
  db()
    .prepare("INSERT INTO artifacts(id, name, mime, path, size, tool, created_at) VALUES(?,?,?,?,?,?,?)")
    .run(id, safe, input.mime, file, input.buffer.length, input.tool, now());
  return { id, name: safe, url: `/api/files/${id}` };
}

export function recordRun(input: {
  tool: string;
  args: unknown;
  result: ToolResult;
  origin: string;
  durationMs: number;
  conversationId?: string | null;
}) {
  db()
    .prepare(
      "INSERT INTO tool_runs(id, tool, args, result, status, error, origin, duration_ms, created_at, conversation_id) VALUES(?,?,?,?,?,?,?,?,?,?)",
    )
    .run(
      uuid(),
      input.tool,
      JSON.stringify(input.args).slice(0, 4000),
      JSON.stringify({ ok: input.result.ok, resumen: input.result.resumen, artefactos: input.result.artefactos ?? [] }).slice(0, 4000),
      input.result.requiere_confirmacion ? "pendiente" : input.result.ok ? "ok" : "error",
      input.result.error?.slice(0, 800) ?? null,
      input.origin,
      input.durationMs,
      now(),
      input.conversationId ?? null,
    );
}

export async function runTool(name: string, args: Record<string, any>, ctx: ToolContext): Promise<ToolResult> {
  const tool = getTool(name);
  if (!tool) throw new Error(`Herramienta desconocida: ${name}`);
  const started = Date.now();
  let result: ToolResult;
  try {
    if (tool.requiere_confirmacion && !ctx.confirmed) {
      result = {
        ok: false,
        requiere_confirmacion: true,
        resumen: `La acción "${tool.descripcion}" requiere tu confirmación antes de ejecutarse.`,
        datos: { herramienta: name, argumentos: args },
      };
    } else {
      result = await tool.ejecutar(args ?? {}, ctx);
    }
  } catch (err: any) {
    result = { ok: false, resumen: `Error ejecutando ${name}`, error: String(err?.message ?? err) };
  }
  recordRun({
    tool: name,
    args,
    result,
    origin: ctx.origin,
    durationMs: Date.now() - started,
    conversationId: ctx.conversationId ?? null,
  });
  return result;
}
