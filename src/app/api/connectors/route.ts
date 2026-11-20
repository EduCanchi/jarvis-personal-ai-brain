import { addLocalFolder, deleteConnector, listConnectors } from "@/lib/connectors";
import { handleError, ok, readJson, requireString } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return ok({ connectors: listConnectors() });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: Request) {
  try {
    const body = await readJson<{ path?: string }>(req);
    const folder = requireString(body.path, "path", 500);
    const connector = addLocalFolder(folder);
    return ok({ connector }, 201);
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(req: Request) {
  try {
    const id = new URL(req.url).searchParams.get("id");
    if (!id) throw new Error("Falta el parámetro id");
    deleteConnector(id);
    return ok({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
