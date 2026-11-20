import { db, now, uuid, Row } from "./db";
import { askJarvis } from "./assistant";
import { chat, parseJsonLoose } from "./nvidia";
import { sendNotification } from "./tools/personal";
import { redact } from "./secrets";

export type Schedule =
  | { tipo: "cada"; minutos: number }
  | { tipo: "diario"; hora: string }
  | { tipo: "semanal"; dia: number; hora: string };

export interface Automation {
  id: string;
  name: string;
  prompt: string;
  schedule: string;
  next_run: string | null;
  enabled: number;
  last_run: string | null;
  last_result: string | null;
  created_at: string;
}

export function parseSchedule(value: string): Schedule {
  const parsed = JSON.parse(value) as Schedule;
  if (parsed.tipo === "cada" && Number(parsed.minutos) > 0) return { tipo: "cada", minutos: Math.max(5, Number(parsed.minutos)) };
  if (parsed.tipo === "diario" && /^\d{2}:\d{2}$/.test(parsed.hora)) return parsed;
  if (parsed.tipo === "semanal" && /^\d{2}:\d{2}$/.test(parsed.hora)) {
    return { tipo: "semanal", dia: Math.max(0, Math.min(6, Number(parsed.dia) || 0)), hora: parsed.hora };
  }
  throw new Error("Programación no válida");
}

export function nextRun(schedule: Schedule, from = new Date()): Date {
  const next = new Date(from);
  if (schedule.tipo === "cada") {
    next.setMinutes(next.getMinutes() + schedule.minutos);
    next.setSeconds(0, 0);
    return next;
  }
  const [hh, mm] = schedule.hora.split(":").map(Number);
  next.setHours(hh, mm, 0, 0);
  if (schedule.tipo === "diario") {
    if (next <= from) next.setDate(next.getDate() + 1);
    return next;
  }
  const target = schedule.dia;
  let delta = (target - next.getDay() + 7) % 7;
  if (delta === 0 && next <= from) delta = 7;
  next.setDate(next.getDate() + delta);
  return next;
}

export function describeSchedule(schedule: Schedule): string {
  if (schedule.tipo === "cada") return `cada ${schedule.minutos} minutos`;
  if (schedule.tipo === "diario") return `cada día a las ${schedule.hora}`;
  const dias = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  return `cada ${dias[schedule.dia]} a las ${schedule.hora}`;
}

export function listAutomations(): Automation[] {
  return db().prepare("SELECT * FROM automations ORDER BY created_at DESC").all() as unknown as Automation[];
}

export function createAutomation(input: { name: string; prompt: string; schedule: Schedule }): Automation {
  const id = uuid();
  const next = nextRun(input.schedule);
  db()
    .prepare("INSERT INTO automations(id, name, prompt, schedule, next_run, enabled, created_at) VALUES(?,?,?,?,?,?,?)")
    .run(id, input.name.slice(0, 120), input.prompt.slice(0, 2000), JSON.stringify(input.schedule), next.toISOString(), 1, now());
  return db().prepare("SELECT * FROM automations WHERE id = ?").get(id) as unknown as Automation;
}

export function updateAutomation(id: string, patch: { enabled?: boolean; name?: string; schedule?: Schedule; prompt?: string }) {
  const current = db().prepare("SELECT * FROM automations WHERE id = ?").get(id) as Row | undefined;
  if (!current) throw new Error("Automatización no encontrada");
  const schedule = patch.schedule ? patch.schedule : parseSchedule(current.schedule);
  const next = patch.schedule ? nextRun(schedule).toISOString() : current.next_run;
  db()
    .prepare("UPDATE automations SET name = ?, prompt = ?, schedule = ?, enabled = ?, next_run = ? WHERE id = ?")
    .run(
      patch.name ?? current.name,
      patch.prompt ?? current.prompt,
      JSON.stringify(schedule),
      patch.enabled === undefined ? current.enabled : patch.enabled ? 1 : 0,
      next,
      id,
    );
  return db().prepare("SELECT * FROM automations WHERE id = ?").get(id) as unknown as Automation;
}

export function deleteAutomation(id: string) {
  db().prepare("DELETE FROM automations WHERE id = ?").run(id);
}

export async function runAutomation(id: string): Promise<{ ok: boolean; resumen: string }> {
  const row = db().prepare("SELECT * FROM automations WHERE id = ?").get(id) as Row | undefined;
  if (!row) throw new Error("Automatización no encontrada");
  const started = now();
  try {
    const result = await askJarvis({
      question: `[Automatización: ${row.name}] ${row.prompt}`,
      conversationId: null,
      origin: "automatizacion",
      useRetrieval: true,
    });
    db()
      .prepare("UPDATE automations SET last_run = ?, last_result = ? WHERE id = ?")
      .run(started, result.answer.slice(0, 4000), id);
    const yaNotificado = result.tools.some((t) => t.herramienta === "enviar_notificacion" && t.ok);
    if (!yaNotificado && result.answer && result.answer.length > 10) {
      void sendNotification({ title: row.name, body: result.answer.slice(0, 800) });
    }
    return { ok: true, resumen: result.answer };
  } catch (err: any) {
    const message = redact(String(err?.message ?? err));
    db().prepare("UPDATE automations SET last_run = ?, last_result = ? WHERE id = ?").run(started, `Error: ${message}`, id);
    return { ok: false, resumen: message };
  }
}

let ticking = false;

export function startScheduler() {
  const globalForSched = globalThis as unknown as { __paibScheduler?: boolean };
  if (globalForSched.__paibScheduler) return;
  globalForSched.__paibScheduler = true;
  setInterval(() => void tick(), 60_000).unref?.();
}

export async function tick() {
  if (ticking) return;
  ticking = true;
  try {
    const due = db()
      .prepare("SELECT * FROM automations WHERE enabled = 1 AND next_run IS NOT NULL AND next_run <= ?")
      .all(now()) as Row[];
    for (const row of due) {
      const schedule = parseSchedule(row.schedule);
      const next = nextRun(schedule);
      db().prepare("UPDATE automations SET next_run = ? WHERE id = ?").run(next.toISOString(), row.id);
      await runAutomation(row.id);
    }
  } catch {
    /* el planificador no debe romper el proceso */
  } finally {
    ticking = false;
  }
}

/** Convierte una instrucción en lenguaje natural en una automatización. */
export async function automationFromNaturalLanguage(instruccion: string): Promise<{
  name: string;
  prompt: string;
  schedule: Schedule;
}> {
  const result = await chat({
    thinking: false,
    maxTokens: 500,
    temperature: 0,
    messages: [
      {
        role: "system",
        content: `Convierte la petición del usuario en una automatización. Responde SOLO JSON:
{"nombre":"...","prompt":"instrucción completa para el asistente","schedule":{"tipo":"cada","minutos":60}}
o {"tipo":"diario","hora":"08:00"} o {"tipo":"semanal","dia":1,"hora":"08:00"}.
"prompt" debe ser una orden clara y autosuficiente. No inventes datos personales.`,
      },
      { role: "user", content: instruccion },
    ],
  });
  const parsed = parseJsonLoose<any>(result.content);
  const schedule = parseSchedule(JSON.stringify(parsed.schedule ?? { tipo: "diario", hora: "08:00" }));
  return {
    name: String(parsed.nombre ?? "Automatización").slice(0, 120),
    prompt: String(parsed.prompt ?? instruccion).slice(0, 2000),
    schedule,
  };
}
