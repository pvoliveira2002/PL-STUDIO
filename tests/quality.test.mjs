import test from "node:test";
import assert from "node:assert/strict";

import {
  fileStem,
  findOversizedFile,
  formatBytes,
} from "../src/shared/files.js";
import { clamp } from "../src/shared/math.js";
import { matchesSearch, normalizeSearchText } from "../src/shared/search.js";
import { calculateCenterCrop } from "../src/features/images/imageProcessing.js";

test("formatBytes apresenta tamanhos legíveis", () => {
  assert.equal(formatBytes(0), "0 KB");
  assert.equal(formatBytes(1024), "1.0 KB");
  assert.equal(formatBytes(1024 * 1024), "1.0 MB");
});

test("fileStem remove apenas a última extensão", () => {
  assert.equal(fileStem("foto.final.jpeg"), "foto.final");
  assert.equal(fileStem("imagem"), "imagem");
});

test("findOversizedFile respeita o limite informado", () => {
  const files = [{ name: "a", size: 10 }, { name: "b", size: 21 }];
  assert.equal(findOversizedFile(files, 20), files[1]);
  assert.equal(findOversizedFile(files, 21), undefined);
});

test("clamp mantém o valor dentro do intervalo", () => {
  assert.equal(clamp(-2, 0, 10), 0);
  assert.equal(clamp(4, 0, 10), 4);
  assert.equal(clamp(15, 0, 10), 10);
});

test("recorte horizontal mantém o centro e a proporção", () => {
  assert.deepEqual(calculateCenterCrop(1200, 600, 1), {
    sourceX: 300,
    sourceY: 0,
    sourceWidth: 600,
    sourceHeight: 600,
  });
});

test("recorte vertical mantém o centro e a proporção", () => {
  assert.deepEqual(calculateCenterCrop(600, 1200, 1), {
    sourceX: 0,
    sourceY: 300,
    sourceWidth: 600,
    sourceHeight: 600,
  });
});

test("recorte rejeita dimensões inválidas", () => {
  assert.throws(() => calculateCenterCrop(0, 1200, 1), RangeError);
  assert.throws(() => calculateCenterCrop(600, 1200, 0), RangeError);
});

test("busca ignora acentos e diferença entre maiúsculas", () => {
  assert.equal(normalizeSearchText("  Marca D'ÁGUA  "), "marca d'agua");
  assert.equal(matchesSearch("Números de página", "numeros"), true);
  assert.equal(matchesSearch("Comprimir PDF", "imagem"), false);
});
