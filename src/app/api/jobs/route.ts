import { db } from "@/lib/db";
import { handleError, ok } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const jobs = db()
      .prepare(
        "SELECT j.*, d.name AS doc_name FROM jobs j LEFT JOIN documents d ON d.id = j.doc_id ORDER BY j.created_at DESC LIMIT 50",
      )
      .all();
    return ok({ jobs });
  } catch (err) {
    return handleError(err);
  }
}
