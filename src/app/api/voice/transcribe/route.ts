import { fail, handleError, ok } from "@/lib/http";
import { transcribe, whisperAvailable, whisperStatus } from "@/lib/voice/stt";
import { listVoices, currentVoice, currentRate } from "@/lib/voice/tts";
import { getSetting } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MAX_AUDIO = 25 * 1024 * 1024;

export async function GET() {
  try {
    const info = whisperAvailable();
    const voices = await listVoices();
    return ok({
      stt: whisperStatus(),
      disponible: info.ok,
      modelo: info.modelo,
      voces: voices,
      voz_actual: currentVoice(),
      velocidad: currentRate(),
      volumen: Number(getSetting("voz_volumen", "0.9")) || 0.9,
      palabra_activacion: getSetting("palabra_activacion", "jarvis"),
      manos_libres: getSetting("modo_manos_libres", "false") === "true",
      auto_tts: getSetting("auto_tts", "true") === "true",
      motor_voz_es: getSetting("motor_voz_es", "kokoro"),
      voz_es: getSetting("voz_es", "em_alex"),
      motor_voz_en: getSetting("motor_voz_en", "kokoro"),
      voz_en: getSetting("voz_en", "bm_george"),
    });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("audio");
    if (!(file instanceof File)) return fail("Falta el campo audio", 400);
    if (file.size === 0) return fail("El audio está vacío", 400);
    if (file.size > MAX_AUDIO) return fail("El audio supera 25 MB", 413);
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await transcribe(buffer, file.name || "audio.webm");
    return ok(result);
  } catch (err) {
    return handleError(err);
  }
}
