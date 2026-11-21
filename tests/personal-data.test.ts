import test from "node:test";
import assert from "node:assert/strict";
import { normalizeAnalyte } from "../src/lib/health.ts";
import { contentHash, decryptText, encryptText } from "../src/lib/crypto.ts";

test("normalizeAnalyte unifica nombres de parámetros", () => {
  assert.equal(normalizeAnalyte("Colesterol Total (mg/dL)"), "colesterol total");
  assert.equal(normalizeAnalyte("COLESTEROL TOTAL"), "colesterol total");
  assert.equal(normalizeAnalyte("Glucosa  basal"), "glucosa basal");
});

test("normalizeAnalyte conserva parámetros distintos", () => {
  assert.notEqual(normalizeAnalyte("Colesterol total"), normalizeAnalyte("Colesterol LDL"));
});

test("cifrado AES-GCM ida y vuelta", () => {
  const texto = "Informe médico: colesterol 210 mg/dL";
  const cifrado = encryptText(texto);
  assert.ok(cifrado.startsWith("v1:"));
  assert.ok(!cifrado.includes("colesterol"));
  assert.equal(decryptText(cifrado), texto);
});

test("el cifrado detecta manipulación", () => {
  const cifrado = encryptText("dato sensible");
  const partes = cifrado.split(":");
  const alterado = [partes[0], partes[1], partes[2], Buffer.from("otra cosa").toString("base64")].join(":");
  assert.throws(() => decryptText(alterado));
});

test("contentHash ignora mayúsculas y espacios", () => {
  assert.equal(contentHash("Prefiere respuestas breves"), contentHash("  prefiere   respuestas BREVES "));
  assert.notEqual(contentHash("Prefiere respuestas breves"), contentHash("Prefiere respuestas largas"));
});
