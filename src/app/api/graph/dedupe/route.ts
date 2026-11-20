import { dedupeNodes } from "@/lib/graph";
import { handleError, ok } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const result = dedupeNodes();
    return ok({ ...result, mensaje: `${result.fusionados} nodos duplicados fusionados` });
  } catch (err) {
    return handleError(err);
  }
}
