import { MODELS, applyModel, catalog, healthCheck, modelId, Role } from "@/lib/models";
import { handleError, ok, readJson } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  try {
    const deep = new URL(req.url).searchParams.get("health") === "1";
    const cat = await catalog();
    const registry = (Object.keys(MODELS) as Role[]).map((role) => ({
      ...MODELS[role],
      actual: modelId(role),
    }));
    const health = deep ? await healthCheck(true) : undefined;
    return ok({ registry, catalogo: cat, health });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: Request) {
  try {
    const body = await readJson<{ role?: Role; model?: string; action?: string }>(req);
    if (body.action === "probar") {
      return ok({ health: await healthCheck(true) });
    }
    if (!body.role || !(body.role in MODELS)) throw new Error('Rol no válido (principal, vision, embeddings)');
    if (!body.model) throw new Error('Falta "model"');
    const cat = await catalog();
    if (cat.ids.length > 0 && !cat.ids.includes(body.model)) {
      throw new Error(`El modelo "${body.model}" no está disponible en tu cuenta de NVIDIA`);
    }
    applyModel(body.role, body.model);
    return ok({ ok: true, role: body.role, model: body.model });
  } catch (err) {
    return handleError(err);
  }
}
