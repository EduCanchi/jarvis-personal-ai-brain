import { createBackup, listBackups } from "@/lib/backup";
import { handleError, ok } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return ok({ backups: listBackups() });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST() {
  try {
    const backup = createBackup();
    return ok({ backup }, 201);
  } catch (err) {
    return handleError(err);
  }
}
