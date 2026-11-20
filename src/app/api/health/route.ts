import { ok } from "@/lib/http";
import { db, getSetting } from "@/lib/db";
import { getApiKey } from "@/lib/secrets";
import { modelId } from "@/lib/models";
import { inFlight } from "@/lib/nvidia";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  db();
  const mem = process.memoryUsage();
  return ok({
    ok: true,
    clave_configurada: Boolean(getApiKey()),
    modelo_principal: modelId("principal"),
    modelo_vision: modelId("vision"),
    modelo_embeddings: modelId("embeddings"),
    procesamiento_remoto: getSetting("procesamiento_remoto", "true") === "true",
    peticiones_activas: inFlight(),
    memoria_rss_mb: Math.round(mem.rss / 1024 / 1024),
    heap_mb: Math.round(mem.heapUsed / 1024 / 1024),
    uptime_s: Math.round(process.uptime()),
  });
}
