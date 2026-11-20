import { getSetting, setSetting } from "./db";
import { chat, embed, listModels } from "./nvidia";
import { getApiKey, redact } from "./secrets";

export type Role = "principal" | "vision" | "embeddings";

export interface ModelInfo {
  role: Role;
  settingKey: string;
  defaultId: string;
  /** Identificador solicitado originalmente en la especificación. */
  requestedId: string;
  purpose: string;
  note?: string;
}

export const MODELS: Record<Role, ModelInfo> = {
  principal: {
    role: "principal",
    settingKey: "modelo_principal",
    defaultId: "nvidia/nemotron-3-ultra-550b-a55b",
    requestedId: "nvidia/nemotron-3-super-120b-a12b",
    purpose: "Razonamiento, extracción de entidades y relaciones, chat con fuentes, planificación.",
    note:
      "Sustitución documentada: nvidia/nemotron-3-super-120b-a12b no aparece en el catálogo accesible de la cuenta. Se usa nemotron-3-ultra-550b-a55b, disponible y verificado en /v1/models.",
  },
  vision: {
    role: "vision",
    settingKey: "modelo_vision",
    defaultId: "nvidia/nemotron-3.5-super-vl-120b-a12b",
    requestedId: "nvidia/nemotron-3.5-super-vl-120b-a12b",
    purpose: "Interpretación de imágenes, diagramas, capturas y páginas escaneadas.",
    note: "Disponible en el catálogo. Devuelve razonamiento en reasoning_content y el texto en content.",
  },
  embeddings: {
    role: "embeddings",
    settingKey: "modelo_embeddings",
    defaultId: "nvidia/nemotron-3.5-embed-8b",
    requestedId: "nvidia/nemotron-3.5-embed-8b",
    purpose: "Vectores de 4096 dimensiones para búsqueda semántica híbrida (FTS5 + coseno).",
    note: "Verificado. Se usa la variante de 8B; 1B existe pero respondió 'Service is overloaded' en la comprobación.",
  },
};

export function modelId(role: Role): string {
  const info = MODELS[role];
  return getSetting(info.settingKey, info.defaultId);
}

export async function catalog(): Promise<{ ids: string[]; error?: string }> {
  if (!getApiKey()) return { ids: [], error: "Sin clave de NVIDIA configurada" };
  try {
    const models = await listModels();
    return { ids: models.map((m) => m.id) };
  } catch (err: any) {
    return { ids: [], error: redact(String(err?.message ?? err)) };
  }
}

export interface HealthCheck {
  role: Role;
  model: string;
  disponible: boolean;
  probado: boolean;
  latencia_ms?: number;
  detalle: string;
}

/** Comprueba catálogo y hace una llamada real mínima a cada modelo. */
export async function healthCheck(deep = true): Promise<HealthCheck[]> {
  const cat = await catalog();
  const results: HealthCheck[] = [];
  for (const role of Object.keys(MODELS) as Role[]) {
    const model = modelId(role);
    const inCatalog = cat.ids.includes(model);
    const item: HealthCheck = {
      role,
      model,
      disponible: inCatalog,
      probado: false,
      detalle: cat.error
        ? cat.error
        : inCatalog
          ? "Presente en el catálogo de la cuenta"
          : "No aparece en el catálogo de la cuenta",
    };
    if (deep && inCatalog) {
      const t0 = Date.now();
      try {
        if (role === "embeddings") {
          const v = await embed(["prueba de conectividad"]);
          item.probado = true;
          item.detalle = `Embedding de ${v[0]?.length ?? 0} dimensiones`;
        } else {
          const r = await chat({
            model,
            thinking: false,
            maxTokens: 32,
            temperature: 0,
            messages: [{ role: "user", content: "Responde únicamente: OK" }],
          });
          item.probado = true;
          item.detalle = `Respuesta: ${(r.content || r.reasoning).trim().slice(0, 60)}`;
        }
        item.latencia_ms = Date.now() - t0;
      } catch (err: any) {
        item.detalle = redact(String(err?.message ?? err));
      }
    }
    results.push(item);
  }
  return results;
}

export function applyModel(role: Role, id: string) {
  setSetting(MODELS[role].settingKey, id);
}
