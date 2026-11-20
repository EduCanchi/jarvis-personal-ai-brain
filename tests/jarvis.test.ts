import test from "node:test";
import assert from "node:assert/strict";
import { nextRun, describeSchedule } from "../src/lib/automations.ts";
import { speechSegments } from "../src/lib/voice/tts.ts";
import { extractFirstJson } from "../src/lib/nvidia.ts";
import { isLoopbackHost } from "../src/lib/auth.ts";

test("nextRun diario programa la próxima hora correcta", () => {
  const from = new Date("2026-05-10T07:30:00");
  const next = nextRun({ tipo: "diario", hora: "08:00" }, from);
  assert.equal(next.getHours(), 8);
  assert.equal(next.getMinutes(), 0);
  assert.equal(next.getDate(), 10);
});

test("nextRun diario salta al día siguiente si la hora ya pasó", () => {
  const from = new Date("2026-05-10T09:00:00");
  const next = nextRun({ tipo: "diario", hora: "08:00" }, from);
  assert.equal(next.getDate(), 11);
});

test("nextRun semanal respeta el día de la semana", () => {
  const from = new Date("2026-05-10T09:00:00");
  const next = nextRun({ tipo: "semanal", dia: 1, hora: "09:00" }, from);
  assert.equal(next.getDay(), 1);
  assert.ok(next > from);
});

test("describeSchedule produce texto en español", () => {
  assert.equal(describeSchedule({ tipo: "cada", minutos: 30 }), "cada 30 minutos");
  assert.equal(describeSchedule({ tipo: "diario", hora: "08:00" }), "cada día a las 08:00");
  assert.match(describeSchedule({ tipo: "semanal", dia: 1, hora: "09:00" }), /lunes/);
});

test("speechSegments corta frases largas y quita markdown", () => {
  const text = "**Hola**. Este es un texto de prueba con [1] una cita. Y otra frase más para completar el fragmento.";
  const segments = speechSegments(text, 40);
  assert.ok(segments.length >= 2);
  assert.ok(segments.every((s) => !s.includes("**") && !s.includes("[1]")));
  assert.ok(segments.every((s) => s.length <= 60));
});

test("extractFirstJson ignora texto posterior y objetos anidados", () => {
  const text = '{"tipo":"herramienta","argumentos":{"a":{"b":1},"c":"x}y"}}\n\n<resultado_herramienta>{"ok":true}</resultado_herramienta>';
  const parsed = extractFirstJson(text);
  assert.equal(parsed.tipo, "herramienta");
  assert.equal(parsed.argumentos.a.b, 1);
  assert.equal(parsed.argumentos.c, "x}y");
});

test("isLoopbackHost distingue local de remoto", () => {
  assert.equal(isLoopbackHost("127.0.0.1:4317"), true);
  assert.equal(isLoopbackHost("localhost:4317"), true);
  assert.equal(isLoopbackHost("[::1]:4317"), true);
  assert.equal(isLoopbackHost("mac.tailnet.ts.net"), false);
  assert.equal(isLoopbackHost(null), false);
});
