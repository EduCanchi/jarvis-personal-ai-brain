import { answerQuestion, saveAssistantError } from "@/lib/rag";
import { handleError, ok, readJson, requireString } from "@/lib/http";
import { NvidiaError } from "@/lib/nvidia";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request) {
  let question = "";
  let conversationId: string | null = null;
  try {
    const body = await readJson<{ question?: string; conversation_id?: string | null }>(req);
    question = requireString(body.question, "question", 4000);
    conversationId = body.conversation_id ?? null;
    const result = await answerQuestion(question, conversationId);
    return ok(result);
  } catch (err) {
    if (question && !(err instanceof NvidiaError && err.code === "sin_clave")) {
      try {
        saveAssistantError(conversationId, question, err instanceof Error ? err.message : String(err));
      } catch {
        /* nada */
      }
    }
    return handleError(err);
  }
}
