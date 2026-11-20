import { restoreBackup } from "@/lib/backup";
import { handleError, ok, readJson } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const body = await readJson<{ file?: string; confirm?: boolean }>(req);
    if (!body.file) throw new Error('Falta "file"');
    const result = await restoreBackup(body.file, body.confirm === true);
    return ok(result);
  } catch (err) {
    return handleError(err);
  }
}
