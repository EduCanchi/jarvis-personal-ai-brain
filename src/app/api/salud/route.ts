import { handleError, ok } from "@/lib/http";
import { getSetting, setSetting } from "@/lib/db";
import { deleteStudy, healthEnabled, healthSummary, importStudy, listStudies, searchAnalytes, studyDetail, trends } from "@/lib/health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  try {
    const params = new URL(req.url).searchParams;
    const analito = params.get("analito");
    if (analito) return ok(trends(analito));
    if (params.get("buscar")) return ok({ resultados: searchAnalytes(params.get("buscar")!) });
    const id = params.get("estudio");
    if (id) {
      const detail = studyDetail(id);
      if (!detail) throw new Error("Estudio no encontrado");
      return ok(detail);
    }
    return ok({ ...healthSummary(), estudios: listStudies(), habilitada: healthEnabled() });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: Request) {
  try {
    const contentType = req.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const body = (await req.json()) as { habilitar?: boolean };
      if (typeof body.habilitar === "boolean") {
        setSetting("salud_habilitada", String(body.habilitar));
        return ok({ habilitada: body.habilitar });
      }
      throw new Error("Petición no válida");
    }
    if (getSetting("salud_habilitada", "false") !== "true") {
      throw new Error("Activa primero la memoria de salud y acepta el aviso de privacidad.");
    }
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new Error("Falta el archivo del informe");
    const consentimiento = String(form.get("consentimiento") ?? "") === "true";
    const result = await importStudy({
      buffer: Buffer.from(await file.arrayBuffer()),
      filename: file.name,
      consentimiento,
    });
    return ok(result, 201);
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(req: Request) {
  try {
    const id = new URL(req.url).searchParams.get("id");
    if (!id) throw new Error("Falta id");
    return ok({ ok: deleteStudy(id) });
  } catch (err) {
    return handleError(err);
  }
}
