import test from "node:test";
import assert from "node:assert/strict";
import { chunkText, estimateTokens } from "../src/lib/chunk.ts";

test("chunkText divide párrafos largos respetando el tamaño", () => {
  const paragraph = "Frase de prueba sobre el Proyecto Aurora. ".repeat(80);
  const chunks = chunkText(paragraph, { size: 500, overlap: 50 });
  assert.ok(chunks.length > 1, "debe producir varios fragmentos");
  for (const c of chunks) {
    assert.ok(c.content.length <= 700, `fragmento demasiado largo: ${c.content.length}`);
  }
});

test("chunkText conserva párrafos cortos en un solo fragmento", () => {
  const chunks = chunkText("Primer párrafo.\n\nSegundo párrafo.", { size: 1400, overlap: 200 });
  assert.equal(chunks.length, 1);
  assert.match(chunks[0].content, /Primer párrafo/);
  assert.match(chunks[0].content, /Segundo párrafo/);
});

test("chunkText etiqueta la página cuando se indica", () => {
  const chunks = chunkText("Contenido de una página concreta del documento.", { page: 7 });
  assert.equal(chunks[0].page, 7);
  assert.equal(chunks[0].kind, "texto");
});

test("chunkText devuelve vacío con texto vacío", () => {
  assert.deepEqual(chunkText("   \n\n  "), []);
});

test("estimateTokens es proporcional a la longitud", () => {
  assert.equal(estimateTokens("12345678"), 2);
});
