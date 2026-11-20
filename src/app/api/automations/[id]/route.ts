import { deleteAutomation, describeSchedule, parseSchedule, runAutomation, updateAutomation } from "@/lib/automations";
import { handleError, ok, readJson } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const body = await readJson<{ enabled?: boolean; nombre?: string; prompt?: string; schedule?: unknown }>(req);
    const automation = updateAutomation(id, {
      enabled: body.enabled,
      name: body.nombre,
      prompt: body.prompt,
      schedule: body.schedule ? parseSchedule(JSON.stringify(body.schedule)) : undefined,
    });
    return ok({ automation: { ...automation, descripcion_horario: describeSchedule(parseSchedule(automation.schedule)) } });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    deleteAutomation(id);
    return ok({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const result = await runAutomation(id);
    return ok(result);
  } catch (err) {
    return handleError(err);
  }
}
