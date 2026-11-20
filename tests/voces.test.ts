import test from "node:test";
import assert from "node:assert/strict";
import { detectLang, VOICES } from "../src/lib/voice/engines.ts";

test("detectLang reconoce español con acentos y palabras frecuentes", () => {
  assert.equal(detectLang("Buenas noches, señor. ¿Preparo el informe?"), "es");
  assert.equal(detectLang("Todos los sistemas están operativos"), "es");
});

test("detectLang reconoce inglés", () => {
  assert.equal(detectLang("Good evening, sir. All systems are operational."), "en");
  assert.equal(detectLang("I have reviewed the schedule and the project report"), "en");
});

test("el catálogo de voces tiene identificadores únicos", () => {
  const ids = VOICES.map((v) => v.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("todas las voces declaran licencia y origen", () => {
  for (const voz of VOICES) {
    assert.ok(voz.licencia.length > 3, `${voz.id} sin licencia`);
    assert.ok(voz.origen.length > 3, `${voz.id} sin origen`);
  }
});

test("la voz JARVIS de Piper está marcada como solo inglés", () => {
  const jarvisEs = VOICES.find((v) => v.id === "piper-jarvis-es");
  assert.ok(jarvisEs?.nota?.includes("Solo inglés"));
  const jarvisEn = VOICES.find((v) => v.id === "piper-jarvis-en");
  assert.equal(jarvisEn?.idioma, "en");
});

test("hay al menos una voz masculina española y otra inglesa", () => {
  assert.ok(VOICES.some((v) => v.idioma === "es" && v.genero === "masculina"));
  assert.ok(VOICES.some((v) => v.idioma === "en" && v.genero === "masculina"));
});
