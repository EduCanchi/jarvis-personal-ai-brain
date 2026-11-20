import { askJarvis } from "@/lib/assistant";
import { handleError, ok, readJson, requireString } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const body = await readJson<{
      question?: string;
      conversation_id?: string | null;
      origin?: "texto" | "voz" | "automatizacion";
      sin_recuperacion?: boolean;
    }>(req);
    const question = requireString(body.question, "question", 4000);
    const result = await askJarvis({
      question,
      conversationId: body.conversation_id ?? null,
      origin: body.origin ?? "texto",
      useRetrieval: body.sin_recuperacion !== true,
    });
    return ok(result);
  } catch (err) {
    return handleError(err);
  }
}
