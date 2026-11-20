import { addDocument, listDocuments, MAX_BYTES } from "@/lib/documents";
import { handleError, ok } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET() {
  try {
    return ok({ documents: listDocuments() });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const files = form.getAll("files").filter((f): f is File => f instanceof File);
    if (files.length === 0) throw new Error("No se recibió ningún archivo");
    if (files.length > 20) throw new Error("Máximo 20 archivos por lote");

    const results: Array<{ id?: string; name: string; duplicate?: boolean; error?: string }> = [];
    for (const file of files) {
      try {
        if (file.size > MAX_BYTES) throw new Error("Supera el límite de 60 MB");
        const buffer = Buffer.from(await file.arrayBuffer());
        const added = await addDocument({ buffer, name: file.name, origin: "subida" });
        results.push({ ...added });
      } catch (err: any) {
        results.push({ name: file.name, error: err?.message ?? "Error desconocido" });
      }
    }
    return ok({ results }, 201);
  } catch (err) {
    return handleError(err);
  }
}
