import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import sharp from "sharp";
import { PDFDocument, PDFName, StandardFonts } from "pdf-lib";
import {
  addPdfFormField,
  comparePageTexts,
  createPdfA2bFromJpegs,
  cropPdf,
  replacePageWithRaster,
  summarizeText,
} from "../src/features/pdf/advancedPdfTools.js";
import { addPageNumbers, effectivePosition, pageNumberLabel } from "../src/features/pdf/pageNumbering.js";
import { addWatermark } from "../src/features/pdf/watermark.js";

async function samplePdf() {
  const document = await PDFDocument.create();
  const page = document.addPage([200, 100]);
  const font = await document.embedFont(StandardFonts.Helvetica);
  page.drawText("Conteudo confidencial de teste", { x: 18, y: 48, size: 12, font });
  return document.save();
}

test("recorte altera as caixas da página sem distorcer o conteúdo", async () => {
  const result = await cropPdf(await samplePdf(), { left: 10, right: 10, top: 5, bottom: 5 });
  const document = await PDFDocument.load(result);
  const box = document.getPage(0).getCropBox();
  assert.deepEqual(box, { x: 20, y: 5, width: 160, height: 90 });
});

test("formulário adiciona um campo de texto preenchível", async () => {
  const result = await addPdfFormField(await samplePdf(), {
    name: "cliente",
    defaultValue: "Maria",
    page: 1,
    x: 10,
    y: 70,
    width: 70,
    height: 10,
  });
  const document = await PDFDocument.load(result);
  const fields = document.getForm().getFields();
  assert.equal(fields.length, 1);
  assert.equal(fields[0].getName(), "cliente");
  assert.equal(fields[0].getText(), "Maria");
});

test("comparação identifica páginas iguais, alteradas e adicionadas", () => {
  const rows = comparePageTexts(["um texto igual", "versao antiga"], ["um texto igual", "versao nova", "pagina extra"]);
  assert.equal(rows[0].status, "igual");
  assert.equal(rows[1].status, "alterada");
  assert.equal(rows[2].status, "adicionada");
});

test("resumo extrativo usa somente frases do texto original", () => {
  const sentences = Array.from({ length: 12 }, (_, index) => `A informação importante número ${index + 1} descreve o atendimento e o documento do cliente.`);
  const source = sentences.join(" ");
  const summary = summarizeText(source, 5);
  assert.equal(summary.split("\n\n").length, 5);
  summary.split("\n\n").forEach((sentence) => assert.ok(source.includes(sentence)));
});

test("PDF/A inclui identificação XMP e OutputIntent sRGB", async () => {
  const jpeg = await sharp({ create: { width: 20, height: 10, channels: 3, background: "white" } }).jpeg().toBuffer();
  const profile = await readFile("C:/Windows/System32/spool/drivers/color/sRGB Color Space Profile.icm");
  const result = await createPdfA2bFromJpegs([{ bytes: jpeg, width: 200, height: 100 }], profile, "Arquivo de teste");
  const document = await PDFDocument.load(result);
  assert.equal(document.getPageCount(), 1);
  assert.ok(document.catalog.get(PDFName.of("OutputIntents")));
  assert.match(Buffer.from(result).toString("latin1"), /pdfaid:conformance>B/);
});

test("redação substitui somente a página escolhida por uma imagem", async () => {
  const source = await PDFDocument.create();
  source.addPage([200, 100]);
  source.addPage([300, 150]);
  const jpeg = await sharp({ create: { width: 40, height: 20, channels: 3, background: "black" } }).jpeg().toBuffer();
  const result = await replacePageWithRaster(await source.save(), 0, jpeg, { width: 200, height: 100 });
  const document = await PDFDocument.load(result);
  assert.equal(document.getPageCount(), 2);
  assert.deepEqual(document.getPage(0).getSize(), { width: 200, height: 100 });
  assert.deepEqual(document.getPage(1).getSize(), { width: 300, height: 150 });
});

test("numeração gera os rótulos e espelha a posição em páginas duplas", () => {
  assert.equal(pageNumberLabel(3, 12, "page-total"), "Página 3 de 12");
  assert.equal(effectivePosition("bottom-right", true, 0), "bottom-right");
  assert.equal(effectivePosition("bottom-right", true, 1), "bottom-left");
  assert.equal(effectivePosition("top-center", true, 1), "top-center");
});

test("numeração preserva quantidade e dimensões das páginas", async () => {
  const source = await PDFDocument.create();
  source.addPage([200, 100]);
  source.addPage([300, 150]);
  const result = await addPageNumbers(await source.save(), {
    start: 7,
    format: "page-total",
    position: "bottom-right",
    duplex: true,
    fontSize: 10,
    marginPt: 20,
    bold: true,
    underline: true,
  });
  const document = await PDFDocument.load(result);
  assert.equal(document.getPageCount(), 2);
  assert.deepEqual(document.getPage(0).getSize(), { width: 200, height: 100 });
  assert.deepEqual(document.getPage(1).getSize(), { width: 300, height: 150 });
  assert.ok(result.length > 500);
});

test("marca d'água mantém páginas, dimensões e aceita camada inferior", async () => {
  const source = await PDFDocument.create();
  const first = source.addPage([210, 110]);
  source.addPage([310, 160]);
  const font = await source.embedFont(StandardFonts.Helvetica);
  first.drawText("Conteúdo", { x: 20, y: 50, size: 12, font });
  const result = await addWatermark(await source.save(), {
    kind: "text",
    text: "CONFIDENCIAL",
    position: "center-center",
    opacity: 0.3,
    rotation: -30,
    fromPage: 1,
    toPage: 2,
    layer: "below",
    bold: true,
    underline: true,
  });
  const document = await PDFDocument.load(result);
  assert.equal(document.getPageCount(), 2);
  assert.deepEqual(document.getPage(0).getSize(), { width: 210, height: 110 });
  assert.deepEqual(document.getPage(1).getSize(), { width: 310, height: 160 });
  assert.ok(result.length > 700);
});
