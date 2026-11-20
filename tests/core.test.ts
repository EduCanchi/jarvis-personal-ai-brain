import test from "node:test";
import assert from "node:assert/strict";
import { canonicalType, normalizeName } from "../src/lib/graph.ts";
import { redact } from "../src/lib/secrets.ts";
import { sanitizeName } from "../src/lib/documents.ts";

test("normalizeName elimina acentos, mayúsculas y puntuación", () => {
  assert.equal(normalizeName("Marta Ruiz"), "marta ruiz");
  assert.equal(normalizeName("Lucía Ferrer"), "lucia ferrer");
  assert.equal(normalizeName("  Nebula   Labs, S.L. "), "nebula labs s l");
});

test("normalizeName colapsa variantes que deben ser el mismo nodo", () => {
  assert.equal(normalizeName("Proyecto Aurora"), normalizeName("proyecto  aurora"));
});

test("canonicalType reconoce sinónimos y cae en concepto", () => {
  assert.equal(canonicalType("Persona"), "persona");
  assert.equal(canonicalType("empresa"), "organizacion");
  assert.equal(canonicalType("Project"), "proyecto");
  assert.equal(canonicalType("desconocido"), "concepto");
});

test("redact oculta claves nvapi y cabeceras Bearer", () => {
  const text = "error con nvapi-abcdefghijklmnopqrstuvwxyz y Bearer abc.def-ghi";
  const out = redact(text);
  assert.ok(!out.includes("nvapi-abcdefghijklmnopqrstuvwxyz"));
  assert.ok(out.includes("nvapi-••••••"));
  assert.ok(!out.includes("Bearer abc.def-ghi"));
});

test("sanitizeName bloquea path traversal y caracteres de control", () => {
  assert.equal(sanitizeName("../../etc/passwd"), "passwd");
  assert.equal(sanitizeName("..\\..\\Windows\\system32"), "system32");
  assert.equal(sanitizeName("informe\u0000.pdf"), "informe.pdf");
  assert.equal(sanitizeName("..."), "documento");
});
