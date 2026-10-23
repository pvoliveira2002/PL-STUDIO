import { execFile } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import sharp from "sharp";
import { PDFDocument, StandardFonts } from "pdf-lib";
import {
  addPdfFormField,
  comparePageTexts,
  createPdfA2bFromJpegs,
  cropPdf,
  replacePageWithRaster,
  summarizeText,
} from "../src/features/pdf/advancedPdfTools.js";

const run = promisify(execFile);
const workspace = path.resolve(process.cwd());
const output = path.resolve(workspace, "tmp-qa-advanced-pdf");
if (!output.startsWith(`${workspace}${path.sep}`)) throw new Error("Diretório de QA inválido.");
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

const source = await PDFDocument.create();
const font = await source.embedFont(StandardFonts.Helvetica);
for (let index = 0; index < 2; index += 1) {
  const page = source.addPage([595.28, 841.89]);
  page.drawText(`Documento local de teste pagina ${index + 1}. Conteudo confidencial para validar as ferramentas.`, { x: 55, y: 760, size: 13, font });
}
const sourceBytes = await source.save();
await writeFile(path.join(output, "entrada.pdf"), sourceBytes);

const cropped = await cropPdf(sourceBytes, { left: 5, right: 5, top: 8, bottom: 8 });
await writeFile(path.join(output, "recortado.pdf"), cropped);
const form = await addPdfFormField(sourceBytes, { name: "cliente", defaultValue: "Teste", page: 1, x: 10, y: 70, width: 80, height: 7 });
await writeFile(path.join(output, "formulario.pdf"), form);
const blackJpeg = await sharp({ create: { width: 1190, height: 1684, channels: 3, background: "black" } }).jpeg({ quality: 95 }).toBuffer();
const redacted = await replacePageWithRaster(sourceBytes, 0, blackJpeg, { width: 595.28, height: 841.89 });
await writeFile(path.join(output, "redigido.pdf"), redacted);
const whiteJpeg = await sharp({ create: { width: 1190, height: 1684, channels: 3, background: "white" } }).jpeg({ quality: 92 }).toBuffer();
const icc = await readFile("C:/Windows/System32/spool/drivers/color/sRGB Color Space Profile.icm");
const pdfa = await createPdfA2bFromJpegs([
  { bytes: whiteJpeg, width: 595.28, height: 841.89 },
  { bytes: whiteJpeg, width: 595.28, height: 841.89 },
], icc, "QA PL Studio");
await writeFile(path.join(output, "arquivo-PDF-A-2b.pdf"), pdfa);

const qpdf = path.join(workspace, "resources", "qpdf", "qpdf.exe");
const checks = {};
for (const name of ["recortado.pdf", "formulario.pdf", "redigido.pdf", "arquivo-PDF-A-2b.pdf"]) {
  try {
    await run(qpdf, ["--check", path.join(output, name)]);
    checks[name] = "estrutura válida";
  } catch (error) {
    checks[name] = error.stderr || error.message;
  }
}

const comparison = comparePageTexts(["texto igual", "versao antiga"], ["texto igual", "versao nova", "pagina adicionada"]);
const summary = summarizeText(Array.from({ length: 10 }, (_, index) => `A frase ${index + 1} documenta o atendimento local e preserva o conteúdo original.`).join(" "), 5);
console.log(JSON.stringify({ output, checks, comparison, summarySentences: summary.split("\n\n").length, processing: "local" }, null, 2));
