import { isLocalRequest } from "@/lib/auth";
import { handleError, ok, readJson } from "@/lib/http";
import { resetMemory } from "@/lib/reset";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    if (!isLocalRequest(req.headers)) throw new Error("Solo disponible desde el propio Mac");
    const body = await readJson<{ confirmar?: boolean }>(req);
    if (body.confirmar !== true) {
      throw new Error("El reinicio requiere confirmación explícita (confirmar: true)");
    }
    const report = await resetMemory();
    return ok(report);
  } catch (err) {
    return handleError(err);
  }
}
