import { registerTool } from "./registry";
import { healthEnabled, listStudies, searchAnalytes, trends } from "../health";
import { buildStyleProfile, classifyPending, currentStyle, draftReply, emailEnabled, getEmail, listEmails } from "../email";
import { db, logEvent, Row } from "../db";

registerTool({
  nombre: "consultar_salud",
  descripcion: "Consulta la evolución de un parámetro de tus informes médicos (solo si la memoria de salud está activa).",
  parametros: { analito: { tipo: "texto", descripcion: "Parámetro, p. ej. colesterol total", obligatorio: true } },
  permisos: ["leer_salud"],
  riesgo: "medio",
  requiere_confirmacion: false,
  estado: () => ({ conectada: healthEnabled(), detalle: healthEnabled() ? "Memoria de salud activa" : "Desactivada por el usuario" }),
  ejecutar: async (args) => {
    if (!healthEnabled()) throw new Error("La memoria de salud está desactivada.");
    const analito = String(args.analito ?? "").trim();
    if (!analito) throw new Error("Falta el parámetro");
    const t = trends(analito);
    logEvent("info", "salud", "Consulta de tendencia médica", { analito });
    if (t.serie.length === 0) {
      const alternativas = searchAnalytes(analito).slice(0, 5).map((a: Row) => a.nombre);
      return {
        ok: true,
        resumen: `No tengo mediciones de "${analito}".${alternativas.length ? ` Quizá te refieras a: ${alternativas.join(", ")}.` : ""}`,
      };
    }
    const resumen = t.serie.map((p) => `${p.fecha}: ${p.valor} ${p.unidad ?? ""}${p.ref_high != null ? ` (ref ≤ ${p.ref_high})` : ""}`).join(" · ");
    return {
      ok: true,
      resumen: `${t.analito}: ${resumen}.${t.aviso ? ` ${t.aviso}` : ""}`,
      datos: t,
    };
  },
});

registerTool({
  nombre: "listar_estudios_medicos",
  descripcion: "Lista los informes médicos incorporados con su fecha y número de parámetros.",
  parametros: {},
  permisos: ["leer_salud"],
  riesgo: "medio",
  requiere_confirmacion: false,
  estado: () => ({ conectada: healthEnabled(), detalle: healthEnabled() ? "Memoria de salud activa" : "Desactivada" }),
  ejecutar: async () => {
    if (!healthEnabled()) throw new Error("La memoria de salud está desactivada.");
    const studies = listStudies();
    return {
      ok: true,
      resumen: studies.length
        ? studies.map((s: Row) => `${s.taken_at} · ${s.lab ?? "informe"} · ${s.parametros} parámetros`).join("\n")
        : "No hay informes médicos guardados.",
      datos: studies,
    };
  },
});

registerTool({
  nombre: "buscar_correos",
  descripcion: "Busca correos importados por asunto, remitente o contenido.",
  parametros: { consulta: { tipo: "texto", descripcion: "Texto a buscar", obligatorio: true } },
  permisos: ["leer_correo"],
  riesgo: "medio",
  requiere_confirmacion: false,
  estado: () => ({ conectada: emailEnabled(), detalle: emailEnabled() ? "Módulo de correo activo" : "Desactivado" }),
  ejecutar: async (args) => {
    if (!emailEnabled()) throw new Error("El módulo de correo está desactivado.");
    const consulta = String(args.consulta ?? "").trim();
    const rows = listEmails({ q: consulta, limit: 10 });
    return {
      ok: true,
      resumen: rows.length
        ? rows.map((e: Row) => `• ${e.subject} — ${e.from_addr}${e.classification ? ` [${e.classification}]` : ""}`).join("\n")
        : "No hay correos que coincidan.",
      datos: rows,
    };
  },
});

registerTool({
  nombre: "clasificar_correos",
  descripcion: "Clasifica los correos pendientes (prioridad, spam, compromisos, respuesta).",
  parametros: { limite: { tipo: "numero", descripcion: "Cuántos clasificar (máx. 20)" } },
  permisos: ["leer_correo"],
  riesgo: "bajo",
  requiere_confirmacion: false,
  estado: () => ({ conectada: emailEnabled(), detalle: emailEnabled() ? "Módulo de correo activo" : "Desactivado" }),
  ejecutar: async (args) => {
    if (!emailEnabled()) throw new Error("El módulo de correo está desactivado.");
    const results = await classifyPending(Math.min(20, Number(args.limite) || 10));
    const ok = results.filter((r) => r.clasificacion).length;
    return { ok: true, resumen: `${ok} correo(s) clasificados.`, datos: results };
  },
});

registerTool({
  nombre: "redactar_correo",
  descripcion: "Redacta un borrador de respuesta a un correo concreto usando el estilo aprendido.",
  parametros: {
    correo_id: { tipo: "texto", descripcion: "Identificador del correo", obligatorio: true },
    instruccion: { tipo: "texto", descripcion: "Qué debe decir el borrador" },
  },
  permisos: ["leer_correo", "escribir_borradores"],
  riesgo: "bajo",
  requiere_confirmacion: false,
  estado: () => ({ conectada: emailEnabled(), detalle: emailEnabled() ? "Borradores locales" : "Desactivado" }),
  ejecutar: async (args) => {
    if (!emailEnabled()) throw new Error("El módulo de correo está desactivado.");
    const id = String(args.correo_id ?? "").trim();
    if (!getEmail(id)) throw new Error("Correo no encontrado");
    const result = await draftReply(id, String(args.instruccion ?? ""));
    return {
      ok: true,
      resumen: `Borrador (no enviado):\n\n${result.borrador}`,
      datos: { estilo_usado: result.estilo_usado },
    };
  },
});

registerTool({
  nombre: "aprender_estilo_correo",
  descripcion: "Analiza tus correos enviados y guarda tu estilo de escritura.",
  parametros: {},
  permisos: ["leer_correo"],
  riesgo: "bajo",
  requiere_confirmacion: false,
  estado: () => ({ conectada: emailEnabled(), detalle: currentStyle() ? "Perfil ya aprendido" : "Sin perfil todavía" }),
  ejecutar: async () => {
    if (!emailEnabled()) throw new Error("El módulo de correo está desactivado.");
    const result = await buildStyleProfile();
    return { ok: true, resumen: `Estilo aprendido con ${result.muestras} correos.`, datos: result.profile };
  },
});

export function emailHealthToolCount(): number {
  return Number((db().prepare("SELECT COUNT(*) AS c FROM emails").get() as Row).c);
}
