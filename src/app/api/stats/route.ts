import { handleError, ok } from "@/lib/http";
import { stats } from "@/lib/stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return ok(stats());
  } catch (err) {
    return handleError(err);
  }
}
