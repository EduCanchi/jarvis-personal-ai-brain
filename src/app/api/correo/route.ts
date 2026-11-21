import { buildStyleProfile, classifyPending, currentStyle, draftReply, emailEnabled, emailStats, getEmail, importEml, listEmails } from "@/lib/email";
import { setSetting } from "@/lib/db";
import { handleError, ok, readJson } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  try {
    const params = new URL(req.url).searchParams;
    const id = params.get("id");
    if (id) {
      const email = getEmail(id);
      if (!email) throw new Error("Correo no encontrado");
      return ok({ email, estilo: currentStyle() });
    }
    return ok({
      ...emailStats(),
      correos: listEmails({
        q: params.get("q") ?? undefined,
        clasificacion: params.get("clasificacion") ?? undefined,
        limit: Number(params.get("limit") ?? 100),
      }),
      estilo: currentStyle(),
      habilitado: emailEnabled(),
    });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: Request) {
  try {
    const contentType = req.headers.get("content-type") ?? "";
    if (contentType.includes("multipart/form-data")) {
      if (!emailEnabled()) throw new Error("Activa el módulo de correo antes de importar mensajes.");
      const form = await req.formData();
      const files = form.getAll("files").filter((f): f is File => f instanceof File);
      if (files.length === 0) throw new Error("No se recibió ningún .eml");
      const folder = String(form.get("folder") ?? "inbox");
      const results = [];
      for (const file of files.slice(0, 50)) {
        try {
          const r = await importEml(Buffer.from(await file.arrayBuffer()), folder);
          results.push({ name: file.name, ...r });
        } catch (err: any) {
          results.push({ name: file.name, error: String(err?.message ?? err) });
        }
      }
      return ok({ results }, 201);
    }

    const body = await readJson<{ accion?: string; id?: string; instruccion?: string; habilitar?: boolean }>(req);
    if (typeof body.habilitar === "boolean") {
      setSetting("correo_habilitado", String(body.habilitar));
      return ok({ habilitado: body.habilitar });
    }
    if (body.accion === "clasificar") return ok({ resultados: await classifyPending(Number((body as any).limite ?? 10)) });
    if (body.accion === "estilo") return ok(await buildStyleProfile());
    if (body.accion === "borrador") {
      if (!body.id) throw new Error("Falta el id del correo");
      return ok(await draftReply(body.id, body.instruccion ?? ""));
    }
    throw new Error("Acción no válida");
  } catch (err) {
    return handleError(err);
  }
}
