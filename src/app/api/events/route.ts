import { db } from "@/lib/db";
import { handleError, ok } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const limit = Math.min(200, Number(new URL(req.url).searchParams.get("limit") ?? 50) || 50);
    const events = db().prepare("SELECT * FROM events ORDER BY id DESC LIMIT ?").all(limit);
    return ok({ events });
  } catch (err) {
    return handleError(err);
  }
}
