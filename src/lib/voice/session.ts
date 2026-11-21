/**
 * Máquina de estados de la conversación por voz.
 *
 * Regla clave: la palabra de activación abre la sesión; dentro de la sesión
 * cualquier frase se procesa sin repetirla. El cierre puede ser explícito
 * (frase de cierre) o por inactividad.
 */

export type VoiceAction =
  | { tipo: "ignorar"; motivo: string }
  | { tipo: "activar"; texto: string }          // abre sesión y responde al contenido (si lo hay)
  | { tipo: "preguntar"; texto: string }        // sesión ya abierta o push-to-talk
  | { tipo: "cerrar"; texto: string };

export interface RouteInput {
  texto: string;
  sesionActiva: boolean;
  manosLibres: boolean;
  palabraActivacion: string;
  frasesCierre: string[];
}

export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.,;:¡!¿?"'()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function fuzzyToken(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 2) return false;
  const dp = Array.from({ length: b.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= a.length; j++) dp[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[j - 1] === b[i - 1] ? 0 : 1));
    }
  }
  return dp[b.length][a.length] <= 2;
}

/** Detecta la palabra de activación tolerando errores del transcriptor (“Yarvis”, “Jarvi”). */
export function detectWake(normalized: string, palabra: string): boolean {
  const wake = normalizeText(palabra);
  if (!wake) return false;
  if (normalized.includes(wake)) return true;
  const tokens = normalized.split(" ").filter(Boolean).slice(0, 4);
  return tokens.some((t) => fuzzyToken(t, wake));
}

/** Elimina la palabra de activación del inicio de la frase. */
export function stripWake(text: string, palabra: string): string {
  const wake = normalizeText(palabra);
  if (!wake) return text.trim();
  const words = text.trim().split(/\s+/);
  const first = normalizeText(words[0] ?? "");
  if (first && (first.includes(wake) || fuzzyToken(first, wake))) {
    return words.slice(1).join(" ").replace(/^[,.\s]+/, "").trim();
  }
  return text.trim();
}

const FILLERS = /^(vale|ok|okay|venga|oye|jarvis|pues|ya esta|ya|gracias|por favor|bueno)[ ,]+/;

/**
 * Solo cierra si la frase ES una orden de cierre (admitiendo muletillas).
 * “termina el informe” no debe cerrar la sesión.
 */
export function isClosing(normalized: string, frases: string[]): boolean {
  if (!normalized || normalized.length > 70) return false;
  let clean = normalized.trim();
  for (let i = 0; i < 3; i++) clean = clean.replace(FILLERS, "").trim();
  clean = clean.replace(/[ ,]+(gracias|por favor)$/g, "").trim();
  return frases.some((frase) => {
    const f = normalizeText(frase);
    return Boolean(f) && clean === f;
  });
}

/**
 * Decide qué hacer con una transcripción.
 * - En sesión activa: cualquier frase es una pregunta (sin wake word).
 * - Fuera de sesión y manos libres: exige wake word para abrir.
 * - Fuera de sesión y push-to-talk: la frase es una pregunta directa.
 * - Frase de cierre: cierra la sesión (con o sin wake word).
 */
export function routeUtterance(input: RouteInput): VoiceAction {
  const normalized = normalizeText(input.texto);
  if (!normalized) return { tipo: "ignorar", motivo: "vacío" };

  const sinWake = stripWake(input.texto, input.palabraActivacion);

  if (input.sesionActiva) {
    if (isClosing(normalizeText(sinWake), input.frasesCierre)) {
      return { tipo: "cerrar", texto: sinWake };
    }
    return { tipo: "preguntar", texto: sinWake || input.texto.trim() };
  }

  if (input.manosLibres) {
    if (!detectWake(normalized, input.palabraActivacion)) {
      return { tipo: "ignorar", motivo: "sin_activacion" };
    }
    if (isClosing(normalizeText(sinWake), input.frasesCierre)) {
      return { tipo: "cerrar", texto: sinWake };
    }
    return { tipo: "activar", texto: sinWake || "" };
  }

  if (isClosing(normalized, input.frasesCierre)) {
    return { tipo: "cerrar", texto: input.texto.trim() };
  }
  return { tipo: "preguntar", texto: input.texto.trim() };
}

/** Próxima marca de inactividad, solo si hay actividad nueva. */
export function nextDeadline(now: number, timeoutSeconds: number, actividad: boolean, anterior: number): number {
  if (!actividad) return anterior;
  return now + Math.max(10, timeoutSeconds) * 1000;
}
