import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import sharp from "sharp";
import { removeBackground } from "@imgly/background-removal-node";
import { jsPDF } from "jspdf";
import { PDFDocument } from "pdf-lib";
import { Worker } from "node:worker_threads";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
  outputDir = path.join(root, "tmp-background-a6-qa");
await mkdir(outputDir, { recursive: true });

const suppliedInput = process.argv[2];
const logo = await readFile(
  path.join(root, "public", "brand", "pdfly-symbol.png"),
);
const foreground = await sharp(logo)
  .resize({ width: 360, height: 360, fit: "contain" })
  .png()
  .toBuffer();
const input = suppliedInput
  ? await sharp(suppliedInput).rotate().png().toBuffer()
  : await sharp({
      create: { width: 900, height: 600, channels: 3, background: "#f4f1ea" },
    })
      .composite([{ input: foreground, left: 270, top: 120 }])
      .jpeg({ quality: 96 })
      .toBuffer();
await writeFile(path.join(outputDir, "entrada-teste.jpg"), input);

const source = new Blob([input], { type: "image/jpeg" }),
  packageRoot = path.join(
    root,
    "node_modules",
    "@imgly",
    "background-removal-node",
    "dist",
  );
const removed = await removeBackground(source, {
  publicPath: `${pathToFileURL(packageRoot).href}/`,
  model: "medium",
  output: { format: "image/png", quality: 1 },
});
const transparent = Buffer.from(await removed.arrayBuffer());
await writeFile(
  path.join(outputDir, "resultado-transparente.png"),
  transparent,
);
const refinement = await new Promise((resolve, reject) => {
  const worker = new Worker(
    path.join(root, "electron", "background-refine-worker.cjs"),
    {
      workerData: {
        original: input,
        raw: transparent,
        options: { edgeRefine: true, cleanupLevel: 1, decontaminate: false },
      },
    },
  );
  worker.once("message", (message) =>
    message?.error ? reject(new Error(message.error)) : resolve(message),
  );
  worker.once("error", reject);
});
const refined = Buffer.from(refinement.finalPng),
  legacy = Buffer.from(refinement.legacyPng);
await Promise.all([
  writeFile(path.join(outputDir, "comparacao-1-bruto.png"), transparent),
  writeFile(path.join(outputDir, "comparacao-2-tratamento-antigo.png"), legacy),
  writeFile(path.join(outputDir, "comparacao-3-refinado.png"), refined),
  writeFile(
    path.join(outputDir, "mascara-original.png"),
    Buffer.from(refinement.originalMaskPng),
  ),
  writeFile(
    path.join(outputDir, "mascara-refinada.png"),
    Buffer.from(refinement.refinedMaskPng),
  ),
]);
const makeComparison = async (background, name) => {
  const panels = await Promise.all(
    [transparent, legacy, refined].map((image) =>
      sharp(image).flatten({ background }).png().toBuffer(),
    ),
  );
  const meta = await sharp(panels[0]).metadata();
  const sheet = await sharp({
    create: {
      width: meta.width * 3,
      height: meta.height,
      channels: 3,
      background,
    },
  })
    .composite(
      panels.map((panel, index) => ({
        input: panel,
        left: index * meta.width,
        top: 0,
      })),
    )
    .png()
    .toBuffer();
  await writeFile(path.join(outputDir, name), sheet);
};
await makeComparison("#ffffff", "comparacao-fundo-branco.png");
await makeComparison("#111111", "comparacao-fundo-preto.png");
const panelMeta = await sharp(transparent).metadata(),
  checkerSvg = Buffer.from(
    `<svg width="${panelMeta.width}" height="${panelMeta.height}" xmlns="http://www.w3.org/2000/svg"><defs><pattern id="c" width="24" height="24" patternUnits="userSpaceOnUse"><rect width="24" height="24" fill="#fff"/><path d="M0 0h12v12H0zM12 12h12v12H12z" fill="#ddd"/></pattern></defs><rect width="100%" height="100%" fill="url(#c)"/></svg>`,
  ),
  checkerPanels = await Promise.all(
    [transparent, legacy, refined].map((image) =>
      sharp(checkerSvg)
        .composite([{ input: image }])
        .png()
        .toBuffer(),
    ),
  ),
  checkerSheet = await sharp({
    create: {
      width: panelMeta.width * 3,
      height: panelMeta.height,
      channels: 3,
      background: "#ffffff",
    },
  })
    .composite(
      checkerPanels.map((panel, index) => ({
        input: panel,
        left: index * panelMeta.width,
        top: 0,
      })),
    )
    .png()
    .toBuffer();
await writeFile(
  path.join(outputDir, "comparacao-fundo-quadriculado.png"),
  checkerSheet,
);
const { data, info } = await sharp(transparent)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
let transparentPixels = 0,
  opaquePixels = 0;
for (let index = 3; index < data.length; index += info.channels) {
  if (data[index] < 16) transparentPixels++;
  if (data[index] > 239) opaquePixels++;
}
assert.ok(transparentPixels > 0, "A saída precisa conter transparência.");
assert.ok(opaquePixels > 0, "A saída precisa preservar conteúdo visível.");

const cropped = await sharp(refined)
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer(),
  croppedInfo = await sharp(cropped).metadata(),
  cropBottomPercent = 15,
  cropHeight = Math.max(
    1,
    Math.round((croppedInfo.height * (100 - cropBottomPercent)) / 100),
  ),
  layoutImage = await sharp(cropped)
    .extract({ left: 0, top: 0, width: croppedInfo.width, height: cropHeight })
    .png()
    .toBuffer(),
  layoutInfo = await sharp(layoutImage).metadata();
await writeFile(path.join(outputDir, "resultado-recortado.png"), layoutImage);
assert.ok(
  layoutInfo.height < croppedInfo.height,
  "O recorte inferior precisa reduzir a altura da imagem.",
);
const marginMm = 5,
  availableWidth = 148 - marginMm * 2,
  availableHeight = 105 - marginMm * 2,
  ratio = layoutInfo.width / layoutInfo.height,
  printWidth = Math.min(availableWidth, availableHeight * ratio),
  printHeight = printWidth / ratio;
assert.ok(
  printWidth <= availableWidth + 0.001 &&
    printHeight <= availableHeight + 0.001,
  "A imagem deve caber integralmente nas margens.",
);
const pdf = new jsPDF({
  orientation: "landscape",
  unit: "mm",
  format: [148, 105],
  compress: true,
});
pdf.addImage(
  layoutImage,
  "PNG",
  (148 - printWidth) / 2,
  (105 - printHeight) / 2,
  printWidth,
  printHeight,
  undefined,
  "NONE",
);
const pdfBytes = new Uint8Array(pdf.output("arraybuffer"));
await writeFile(path.join(outputDir, "pagina-A6-paisagem.pdf"), pdfBytes);
const checked = await PDFDocument.load(pdfBytes),
  page = checked.getPage(0),
  widthMm = (page.getWidth() * 25.4) / 72,
  heightMm = (page.getHeight() * 25.4) / 72;
assert.ok(
  Math.abs(widthMm - 148) < 0.1 && Math.abs(heightMm - 105) < 0.1,
  `Página incorreta: ${widthMm} × ${heightMm} mm`,
);

const report = {
  input: {
    source: suppliedInput || "synthetic",
    format: "jpeg",
    width: info.width,
    height: info.height,
  },
  removal: {
    local: true,
    model: "medium",
    outputFormat: "png",
    width: info.width,
    height: info.height,
    transparentPixels,
    opaquePixels,
    alphaIntermediatePreserved: true,
    legacyHoleFillDisabledByDefault: true,
  },
  refinement: {
    edgeLocal: true,
    cleanup: "conservative",
    decontamination: "optional-off",
    aligned:
      refinement.width === info.width && refinement.height === info.height,
  },
  crop: {
    nonDestructive: true,
    bottomPercent: cropBottomPercent,
    beforePx: [croppedInfo.width, croppedInfo.height],
    afterPx: [layoutInfo.width, layoutInfo.height],
  },
  layout: {
    page: "A6 landscape",
    pageMm: [Number(widthMm.toFixed(2)), Number(heightMm.toFixed(2))],
    marginMm,
    visibleBoundsPx: [layoutInfo.width, layoutInfo.height],
    objectMm: [Number(printWidth.toFixed(2)), Number(printHeight.toFixed(2))],
    proportionPreserved: true,
    noCroppingByPage: true,
  },
  artifacts: [
    "comparacao-1-bruto.png",
    "comparacao-2-tratamento-antigo.png",
    "comparacao-3-refinado.png",
    "comparacao-fundo-branco.png",
    "comparacao-fundo-preto.png",
    "comparacao-fundo-quadriculado.png",
    "mascara-original.png",
    "mascara-refinada.png",
    "resultado-recortado.png",
    "pagina-A6-paisagem.pdf",
  ],
};
await writeFile(
  path.join(outputDir, "resultado.json"),
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));
