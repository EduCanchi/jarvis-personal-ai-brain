import {
  automationFromNaturalLanguage,
  createAutomation,
  describeSchedule,
  listAutomations,
  parseSchedule,
  startScheduler,
} from "@/lib/automations";
import { handleError, ok, readJson, requireString } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET() {
  try {
    startScheduler();
    const items = listAutomations().map((a) => ({
      ...a,
      descripcion_horario: describeSchedule(parseSchedule(a.schedule)),
    }));
    return ok({ automations: items });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: Request) {
  try {
    const body = await readJson<{
      nombre?: string;
      prompt?: string;
      schedule?: unknown;
      instruccion?: string;
    }>(req);
    let name: string;
    let prompt: string;
    let schedule;
    if (body.instruccion) {
      const parsed = await automationFromNaturalLanguage(requireString(body.instruccion, "instruccion", 1000));
      name = parsed.name;
      prompt = parsed.prompt;
      schedule = parsed.schedule;
    } else {
      name = requireString(body.nombre, "nombre", 120);
      prompt = requireString(body.prompt, "prompt", 2000);
      schedule = parseSchedule(JSON.stringify(body.schedule ?? { tipo: "diario", hora: "08:00" }));
    }
    const automation = createAutomation({ name, prompt, schedule });
    return ok({ automation: { ...automation, descripcion_horario: describeSchedule(schedule) } }, 201);
  } catch (err) {
    return handleError(err);
  }
}
