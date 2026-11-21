import test from "node:test";
import assert from "node:assert/strict";
import { detectWake, isClosing, routeUtterance, stripWake, nextDeadline } from "../src/lib/voice/session.ts";

const FRASES = ["termina", "adiós", "hasta luego", "eso es todo", "cierra sesión"];
const base = { manosLibres: true, palabraActivacion: "jarvis", frasesCierre: FRASES };

test("una sola activación abre la sesión", () => {
  const r = routeUtterance({ ...base, texto: "Jarvis", sesionActiva: false });
  assert.equal(r.tipo, "activar");
  assert.equal((r as any).texto, "");
});

test("activar con contenido responde en la misma frase", () => {
  const r = routeUtterance({ ...base, texto: "Jarvis, ¿qué hora es?", sesionActiva: false });
  assert.equal(r.tipo, "activar");
  assert.equal((r as any).texto, "¿qué hora es?");
});

test("diez intervenciones seguidas sin repetir la palabra", () => {
  const frases = [
    "Jarvis",
    "prepárame un resumen del día",
    "y mañana qué tengo",
    "añade la reunión con Laura",
    "¿quién es Laura?",
    "recuérdame llamarla a las cinco",
    "¿qué documentos tengo del proyecto?",
    "compárame los dos últimos informes",
    "crea una nota con las conclusiones",
    "y envíame la nota por correo",
  ];
  let sesion = false;
  const acciones: string[] = [];
  for (const frase of frases) {
    const r = routeUtterance({ ...base, texto: frase, sesionActiva: sesion });
    acciones.push(r.tipo);
    if (r.tipo === "activar") sesion = true;
    if (r.tipo === "cerrar") sesion = false;
    if (r.tipo === "ignorar") throw new Error(`no debería ignorar: ${frase}`);
  }
  assert.equal(acciones[0], "activar");
  assert.ok(acciones.slice(1).every((a) => a === "preguntar"));
});

test("fuera de sesión, sin la palabra, se ignora", () => {
  const r = routeUtterance({ ...base, texto: "pon música", sesionActiva: false });
  assert.equal(r.tipo, "ignorar");
});

test("tolera transcripciones imperfectas de la palabra", () => {
  for (const texto of ["Yarvis, hola", "Jarvi, hola", "yarvis hola"]) {
    const r = routeUtterance({ ...base, texto, sesionActiva: false });
    assert.equal(r.tipo, "activar", texto);
  }
});

test("la frase de cierre termina la sesión, con o sin palabra", () => {
  const a = routeUtterance({ ...base, texto: "Jarvis, termina", sesionActiva: true });
  assert.equal(a.tipo, "cerrar");
  const b = routeUtterance({ ...base, texto: "hasta luego", sesionActiva: true });
  assert.equal(b.tipo, "cerrar");
  const c = routeUtterance({ ...base, texto: "eso es todo", sesionActiva: true });
  assert.equal(c.tipo, "cerrar");
});

test("una frase normal que contiene una palabra parecida no cierra", () => {
  const r = routeUtterance({ ...base, texto: "termina el informe y mándalo", sesionActiva: true });
  assert.equal(r.tipo, "preguntar");
});

test("push-to-talk no exige palabra de activación", () => {
  const r = routeUtterance({ ...base, manosLibres: false, texto: "¿qué tengo mañana?", sesionActiva: false });
  assert.equal(r.tipo, "preguntar");
});

test("stripWake quita solo la primera palabra de activación", () => {
  assert.equal(stripWake("Jarvis, ¿qué hora es?", "jarvis"), "¿qué hora es?");
  assert.equal(stripWake("Yarvis prepara el informe", "jarvis"), "prepara el informe");
  assert.equal(stripWake("el informe de Jarvis", "jarvis"), "el informe de Jarvis");
});

test("detectWake no confunde palabras normales", () => {
  assert.equal(detectWake("jardines y jarrones", "jarvis"), false);
  assert.equal(detectWake("jarvis", "jarvis"), true);
});

test("isClosing respeta el contexto de la frase", () => {
  assert.equal(isClosing("termina", FRASES), true);
  assert.equal(isClosing("termina el informe", FRASES), false);
  assert.equal(isClosing("vale, termina", FRASES), true);
  assert.equal(isClosing("jarvis hasta luego", FRASES), true);
  assert.equal(isClosing("hola adios", FRASES), false);
});

test("el plazo de inactividad solo se renueva con actividad", () => {
  const anterior = 1000;
  assert.equal(nextDeadline(5000, 60, false, anterior), anterior);
  assert.equal(nextDeadline(5000, 60, true, anterior), 5000 + 60000);
});
