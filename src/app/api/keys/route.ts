import { handleError, ok, readJson } from "@/lib/http";
import { apiKeySource, deleteApiKey, saveApiKey } from "@/lib/secrets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return ok({ configurada: apiKeySource() !== "ninguna", origen: apiKeySource() });
}

export async function POST(req: Request) {
  try {
    const body = await readJson<{ key?: string }>(req);
    if (!body.key) throw new Error("Falta la clave");
    const result = saveApiKey(body.key);
    return ok({ ok: true, almacenamiento: result.store });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE() {
  try {
    deleteApiKey();
    return ok({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
