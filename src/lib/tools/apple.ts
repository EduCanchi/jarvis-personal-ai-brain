import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { registerTool } from "./registry";
import { redact } from "../secrets";

const run = promisify(execFile);

async function osa(script: string, args: string[] = [], timeout = 20_000): Promise<string> {
  try {
    const { stdout } = await run("/usr/bin/osascript", ["-e", script, ...(args.length ? ["--", ...args] : [])], {
      timeout,
      maxBuffer: 4 * 1024 * 1024,
    });
    return stdout.trim();
  } catch (err: any) {
    const message = String(err?.stderr || err?.message || err);
    if (/-1743|not authorized|no está autorizado|Not authorized/i.test(message)) {
      throw new Error(
        "macOS requiere autorización de Automatización. Ve a Ajustes del Sistema → Privacidad y seguridad → Automatización y permite que el proceso de JARVIS controle esta app.",
      );
    }
    throw new Error(redact(message).slice(0, 400));
  }
}

const AGENDA_SCRIPT = `
on run argv
  set dias to (item 1 of argv) as integer
  set inicio to current date
  set fin to inicio + (dias * days)
  set salida to ""
  tell application "Calendar"
    repeat with cal in calendars
      try
        repeat with ev in (every event of cal whose start date is greater than or equal to inicio and start date is less than or equal to fin)
          set salida to salida & (summary of ev) & " :: " & (start date of ev as string) & " :: " & (name of cal) & linefeed
        end repeat
      end try
    end repeat
  end tell
  return salida
end run
`;

const RECORDATORIO_SCRIPT = `
on run argv
  set titulo to item 1 of argv
  tell application "Reminders"
    tell default list
      make new reminder with properties {name:titulo}
    end tell
  end tell
  return "ok"
end run
`;

const NOTA_SCRIPT = `
on run argv
  set titulo to item 1 of argv
  set cuerpo to item 2 of argv
  tell application "Notes"
    make new note at folder "Notes" with properties {name:titulo, body:cuerpo}
  end tell
  return "ok"
end run
`;

const EVENTO_SCRIPT = `
on run argv
  set titulo to item 1 of argv
  set inicioTexto to item 2 of argv
  set duracion to (item 3 of argv) as integer
  set inicio to date inicioTexto
  set fin to inicio + (duracion * minutes)
  tell application "Calendar"
    tell calendar 1
      make new event with properties {summary:titulo, start date:inicio, end date:fin}
    end tell
  end tell
  return "ok"
end run
`;

registerTool({
  nombre: "consultar_agenda",
  descripcion: "Lee los eventos del calendario de macOS para los próximos días.",
  parametros: { dias: { tipo: "numero", descripcion: "Número de días a consultar (1-30)", obligatorio: true } },
  permisos: ["leer_calendario"],
  riesgo: "medio",
  requiere_confirmacion: false,
  estado: () => ({ conectada: true, detalle: "Calendar vía AppleScript (requiere permiso de Automatización)" }),
  ejecutar: async (args) => {
    const dias = Math.max(1, Math.min(30, Number(args.dias) || 1));
    const output = await osa(AGENDA_SCRIPT, [String(dias)], 30_000);
    const eventos = output
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [titulo, fecha, calendario] = line.split(" :: ");
        return { titulo, fecha, calendario };
      });
    return {
      ok: true,
      resumen: eventos.length ? `${eventos.length} evento(s) en los próximos ${dias} día(s).` : `No hay eventos en los próximos ${dias} día(s).`,
      datos: eventos.slice(0, 60),
    };
  },
});

registerTool({
  nombre: "crear_recordatorio",
  descripcion: "Crea un recordatorio en la app Recordatorios de macOS.",
  parametros: { titulo: { tipo: "texto", descripcion: "Texto del recordatorio", obligatorio: true } },
  permisos: ["escribir_recordatorios"],
  riesgo: "medio",
  requiere_confirmacion: true,
  estado: () => ({ conectada: true, detalle: "Recordatorios vía AppleScript" }),
  ejecutar: async (args) => {
    const titulo = String(args.titulo ?? "").trim().slice(0, 200);
    if (!titulo) throw new Error("Falta el título del recordatorio");
    await osa(RECORDATORIO_SCRIPT, [titulo]);
    return { ok: true, resumen: `Recordatorio creado: “${titulo}”` };
  },
});

registerTool({
  nombre: "crear_evento",
  descripcion: "Crea un evento en el calendario de macOS.",
  parametros: {
    titulo: { tipo: "texto", descripcion: "Título del evento", obligatorio: true },
    inicio: { tipo: "texto", descripcion: "Fecha y hora local, formato YYYY-MM-DD HH:MM", obligatorio: true },
    duracion_min: { tipo: "numero", descripcion: "Duración en minutos (por defecto 60)" },
  },
  permisos: ["escribir_calendario"],
  riesgo: "medio",
  requiere_confirmacion: true,
  estado: () => ({ conectada: true, detalle: "Calendar vía AppleScript" }),
  ejecutar: async (args) => {
    const titulo = String(args.titulo ?? "").trim().slice(0, 200);
    const inicio = String(args.inicio ?? "").trim();
    if (!titulo || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(inicio)) {
      throw new Error("Se necesita título y fecha con formato YYYY-MM-DD HH:MM");
    }
    const duracion = Math.max(15, Math.min(480, Number(args.duracion_min) || 60));
    await osa(EVENTO_SCRIPT, [titulo, inicio, String(duracion)]);
    return { ok: true, resumen: `Evento creado: “${titulo}” el ${inicio}` };
  },
});

registerTool({
  nombre: "crear_nota_apple",
  descripcion: "Guarda una nota en la app Notas de macOS.",
  parametros: {
    titulo: { tipo: "texto", descripcion: "Título de la nota", obligatorio: true },
    contenido: { tipo: "texto", descripcion: "Cuerpo de la nota", obligatorio: true },
  },
  permisos: ["escribir_notas"],
  riesgo: "medio",
  requiere_confirmacion: true,
  estado: () => ({ conectada: true, detalle: "Notas vía AppleScript" }),
  ejecutar: async (args) => {
    const titulo = String(args.titulo ?? "").trim().slice(0, 120);
    const contenido = String(args.contenido ?? "").slice(0, 8000);
    if (!titulo || !contenido) throw new Error("Faltan título o contenido");
    await osa(NOTA_SCRIPT, [titulo, contenido]);
    return { ok: true, resumen: `Nota guardada en Notas: “${titulo}”` };
  },
});

export async function localNotification(title: string, message: string): Promise<void> {
  const script = `on run argv
    display notification (item 2 of argv) with title (item 1 of argv) sound name "Glass"
    return "ok"
  end run`;
  await osa(script, [title.slice(0, 120), message.slice(0, 500)]);
}
