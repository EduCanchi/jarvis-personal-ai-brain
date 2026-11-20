import { db, getSetting, now, uuid, Row } from "../db";
import { registerTool } from "./registry";
import { retrieve } from "../rag";
import { localNotification } from "./apple";
import { redact } from "../secrets";

export async function sendNotification(input: { title: string; body: string; channel?: string }): Promise<{
  ok: boolean;
  canal: string;
  detalle: string;
}> {
  const channel = input.channel || getSetting("canal_notificaciones", "local") || "local";
  const id = uuid();
  const title = input.title.slice(0, 160);
  const body = input.body.slice(0, 1200);
  let ok = false;
  let detalle = "";

  try {
    if (channel === "ntfy") {
      const topic = getSetting("ntfy_topic", "").trim();
      if (!topic) throw new Error("Falta el tema de ntfy (Configuración → Notificaciones)");
      const res = await fetch(`https://ntfy.sh/${encodeURIComponent(topic)}`, {
        method: "POST",
        headers: { Title: encodeURIComponent(title), Priority: "default", Tags: "robot" },
        body,
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new Error(`ntfy respondió ${res.status}`);
      ok = true;
      detalle = `Enviado a ntfy.sh/${topic}`;
    } else if (channel === "telegram") {
      const token = getSetting("telegram_token", "").trim();
      const chat = getSetting("telegram_chat_id", "").trim();
      if (!token || !chat) throw new Error("Faltan token y chat_id de Telegram");
      const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chat, text: `${title}\n\n${body}` }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new Error(`Telegram respondió ${res.status}`);
      ok = true;
      detalle = "Enviado por Telegram";
    } else {
      await localNotification(title, body);
      ok = true;
      detalle = "Notificación local de macOS";
    }
  } catch (err: any) {
    detalle = redact(String(err?.message ?? err));
  }

  db()
    .prepare("INSERT INTO notifications(id, channel, title, body, status, error, created_at) VALUES(?,?,?,?,?,?,?)")
    .run(id, channel, title, body, ok ? "enviada" : "error", ok ? null : detalle, now());
  return { ok, canal: channel, detalle };
}

registerTool({
  nombre: "enviar_notificacion",
  descripcion: "Envía una notificación al Mac o al iPhone (según el canal configurado).",
  parametros: {
    titulo: { tipo: "texto", descripcion: "Título", obligatorio: true },
    mensaje: { tipo: "texto", descripcion: "Cuerpo del mensaje", obligatorio: true },
  },
  permisos: ["enviar_notificaciones"],
  riesgo: "bajo",
  requiere_confirmacion: false,
  estado: () => {
    const canal = getSetting("canal_notificaciones", "local");
    const listo = canal === "local" || (canal === "ntfy" && getSetting("ntfy_topic", "")) || (canal === "telegram" && getSetting("telegram_token", "") && getSetting("telegram_chat_id", ""));
    return { conectada: Boolean(listo), detalle: `Canal: ${canal}${listo ? "" : " (sin configurar)"}` };
  },
  ejecutar: async (args) => {
    const result = await sendNotification({ title: String(args.titulo ?? "JARVIS"), body: String(args.mensaje ?? "") });
    return {
      ok: result.ok,
      resumen: result.ok ? `Notificación enviada (${result.canal}).` : `No se pudo notificar: ${result.detalle}`,
      error: result.ok ? undefined : result.detalle,
      datos: result,
    };
  },
});

registerTool({
  nombre: "buscar_conocimiento",
  descripcion: "Busca en los documentos y la memoria del cerebro (búsqueda híbrida con fuentes).",
  parametros: { consulta: { tipo: "texto", descripcion: "Qué buscar", obligatorio: true } },
  permisos: ["leer_memoria"],
  riesgo: "bajo",
  requiere_confirmacion: false,
  estado: () => ({ conectada: true, detalle: "SQLite FTS5 + embeddings" }),
  ejecutar: async (args) => {
    const consulta = String(args.consulta ?? "").trim();
    if (!consulta) throw new Error("Falta la consulta");
    const sources = await retrieve(consulta, 6);
    return {
      ok: true,
      resumen: sources.length
        ? sources.map((s, i) => `[${i + 1}] ${s.doc_name}${s.page ? ` (p.${s.page})` : ""}: ${s.content.slice(0, 260).replace(/\s+/g, " ")}…`).join("\n")
        : "No hay evidencia en los documentos para esa consulta.",
      datos: sources.map((s) => ({ doc: s.doc_name, page: s.page, chunk_id: s.chunk_id, score: s.score })),
    };
  },
});

registerTool({
  nombre: "guardar_nota",
  descripcion: "Guarda una nota o preferencia personal en la memoria de JARVIS.",
  parametros: {
    titulo: { tipo: "texto", descripcion: "Título breve", obligatorio: true },
    contenido: { tipo: "texto", descripcion: "Contenido", obligatorio: true },
    etiquetas: { tipo: "texto", descripcion: "Etiquetas separadas por comas" },
  },
  permisos: ["escribir_memoria"],
  riesgo: "bajo",
  requiere_confirmacion: false,
  estado: () => ({ conectada: true, detalle: "Memoria local" }),
  ejecutar: async (args) => {
    const titulo = String(args.titulo ?? "").trim().slice(0, 160);
    const contenido = String(args.contenido ?? "").trim().slice(0, 20_000);
    if (!titulo || !contenido) throw new Error("Faltan título o contenido");
    const id = uuid();
    const ts = now();
    db()
      .prepare("INSERT INTO notes(id, title, content, tags, created_at, updated_at) VALUES(?,?,?,?,?,?)")
      .run(id, titulo, contenido, String(args.etiquetas ?? "").slice(0, 200), ts, ts);
    return { ok: true, resumen: `Nota guardada: “${titulo}”`, datos: { id } };
  },
});

registerTool({
  nombre: "buscar_notas",
  descripcion: "Busca en las notas y preferencias guardadas.",
  parametros: { consulta: { tipo: "texto", descripcion: "Texto a buscar", obligatorio: true } },
  permisos: ["leer_memoria"],
  riesgo: "bajo",
  requiere_confirmacion: false,
  estado: () => ({ conectada: true, detalle: "Memoria local" }),
  ejecutar: async (args) => {
    const q = `%${String(args.consulta ?? "").trim()}%`;
    const rows = db()
      .prepare("SELECT title, content, created_at FROM notes WHERE title LIKE ? OR content LIKE ? ORDER BY created_at DESC LIMIT 20")
      .all(q, q) as Row[];
    return {
      ok: true,
      resumen: rows.length ? rows.map((r) => `• ${r.title}: ${String(r.content).slice(0, 180)}`).join("\n") : "No hay notas que coincidan.",
      datos: rows,
    };
  },
});

registerTool({
  nombre: "buscar_archivos",
  descripcion: "Busca archivos en el Mac con Spotlight (mdfind).",
  parametros: {
    consulta: { tipo: "texto", descripcion: "Nombre o contenido a buscar", obligatorio: true },
    carpeta: { tipo: "texto", descripcion: "Carpeta donde limitar la búsqueda (opcional)" },
  },
  permisos: ["leer_archivos"],
  riesgo: "medio",
  requiere_confirmacion: false,
  estado: () => ({ conectada: true, detalle: "Spotlight (mdfind)" }),
  ejecutar: async (args) => {
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const run = promisify(execFile);
    const consulta = String(args.consulta ?? "").trim();
    if (!consulta) throw new Error("Falta la consulta");
    const cmdArgs = [consulta];
    if (args.carpeta) cmdArgs.push("-onlyin", String(args.carpeta));
    const { stdout } = await run("/usr/bin/mdfind", cmdArgs, { timeout: 15_000, maxBuffer: 1024 * 1024 });
    const files = stdout.split("\n").filter(Boolean).slice(0, 25);
    return {
      ok: true,
      resumen: files.length ? `${files.length} archivo(s) encontrados:\n${files.join("\n")}` : "Sin resultados.",
      datos: files,
    };
  },
});

registerTool({
  nombre: "estado_sistema",
  descripcion: "Consulta RAM, CPU, disco y estado de los modelos del sistema.",
  parametros: {},
  permisos: ["leer_sistema"],
  riesgo: "bajo",
  requiere_confirmacion: false,
  estado: () => ({ conectada: true, detalle: "Métricas locales" }),
  ejecutar: async () => {
    const os = await import("node:os");
    const mem = process.memoryUsage();
    const total = os.totalmem() / 1024 ** 3;
    const free = os.freemem() / 1024 ** 3;
    const load = os.loadavg()[0];
    return {
      ok: true,
      resumen: `RAM del sistema: ${free.toFixed(1)} GB libres de ${total.toFixed(1)} GB. Carga media: ${load.toFixed(2)}. Proceso JARVIS: ${Math.round(mem.rss / 1024 ** 2)} MB.`,
      datos: { total_gb: total, libre_gb: free, load, rss_mb: Math.round(mem.rss / 1024 ** 2) },
    };
  },
});
