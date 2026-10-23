import {
  PDFDocument,
  PDFName,
  PDFString,
  StandardFonts,
  rgb,
} from "pdf-lib";

const percentage = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(95, number)) : fallback;
};

export async function cropPdf(bytes, crop) {
  const document = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const left = percentage(crop.left);
  const right = percentage(crop.right);
  const top = percentage(crop.top);
  const bottom = percentage(crop.bottom);
  if (left + right >= 95 || top + bottom >= 95) {
    throw new Error("A área de recorte ficou pequena demais.");
  }
  document.getPages().forEach((page) => {
    const { width, height } = page.getSize();
    const x = (width * left) / 100;
    const y = (height * bottom) / 100;
    const croppedWidth = (width * (100 - left - right)) / 100;
    const croppedHeight = (height * (100 - top - bottom)) / 100;
    page.setCropBox(x, y, croppedWidth, croppedHeight);
    page.setBleedBox(x, y, croppedWidth, croppedHeight);
    page.setTrimBox(x, y, croppedWidth, croppedHeight);
    page.setArtBox(x, y, croppedWidth, croppedHeight);
  });
  return document.save();
}

export async function addPdfFormField(bytes, options) {
  const document = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const pages = document.getPages();
  const pageIndex = Math.max(
    0,
    Math.min(pages.length - 1, Math.round(Number(options.page) || 1) - 1),
  );
  const page = pages[pageIndex];
  const { width, height } = page.getSize();
  const form = document.getForm();
  const safeName = String(options.name || "campo")
    .trim()
    .replace(/[^a-zA-Z0-9_.-]+/g, "-")
    .replace(/^-+|-+$/g, "") || `campo-${Date.now()}`;
  let fieldName = safeName;
  let suffix = 2;
  while (form.getFields().some((field) => field.getName() === fieldName)) {
    fieldName = `${safeName}-${suffix++}`;
  }
  const field = form.createTextField(fieldName);
  const font = await document.embedFont(StandardFonts.Helvetica);
  const x = (width * percentage(options.x, 10)) / 100;
  const fieldWidth = (width * Math.max(5, percentage(options.width, 80))) / 100;
  const fieldHeight = (height * Math.max(2, percentage(options.height, 7))) / 100;
  const top = percentage(options.y, 80);
  const y = height - (height * top) / 100 - fieldHeight;
  field.addToPage(page, {
    x,
    y,
    width: Math.min(fieldWidth, width - x),
    height: Math.min(fieldHeight, height - y),
    font,
    borderWidth: 1,
    borderColor: rgb(0.35, 0.38, 0.45),
    backgroundColor: rgb(1, 1, 1),
    textColor: rgb(0.08, 0.1, 0.14),
  });
  if (options.defaultValue) field.setText(String(options.defaultValue));
  form.updateFieldAppearances(font);
  document.setModificationDate(new Date());
  return document.save();
}

export async function replacePageWithRaster(bytes, pageIndex, jpegBytes, size) {
  const source = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const output = await PDFDocument.create();
  const target = Math.max(0, Math.min(source.getPageCount() - 1, Number(pageIndex) || 0));
  for (let index = 0; index < source.getPageCount(); index += 1) {
    if (index === target) {
      const image = await output.embedJpg(jpegBytes);
      const page = output.addPage([size.width, size.height]);
      page.drawImage(image, { x: 0, y: 0, width: size.width, height: size.height });
    } else {
      const [copy] = await output.copyPages(source, [index]);
      output.addPage(copy);
    }
  }
  output.setProducer("PL Studio — redação rasterizada segura");
  output.setModificationDate(new Date());
  return output.save();
}

const normalizeText = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export function comparePageTexts(leftPages, rightPages) {
  const total = Math.max(leftPages.length, rightPages.length);
  return Array.from({ length: total }, (_, index) => {
    if (!leftPages[index]) return { page: index + 1, status: "adicionada", similarity: 0 };
    if (!rightPages[index]) return { page: index + 1, status: "removida", similarity: 0 };
    const left = new Set(normalizeText(leftPages[index]).split(" ").filter(Boolean));
    const right = new Set(normalizeText(rightPages[index]).split(" ").filter(Boolean));
    const union = new Set([...left, ...right]);
    const common = [...left].filter((token) => right.has(token)).length;
    const similarity = union.size ? Math.round((common / union.size) * 100) : 100;
    return {
      page: index + 1,
      status: similarity === 100 ? "igual" : "alterada",
      similarity,
    };
  });
}

const stopWords = new Set(
  "a ao aos aquela aquelas aquele aqueles as com como da das de dela dele do dos e ela ele em entre era essa esse esta este eu foi foram há isso isto já mais mas me mesmo minha muito na não nas nem no nos nós o os ou para pela pelo por porque que quem se sem ser seu sua também tem ter um uma você".split(
    " ",
  ),
);

export function summarizeText(text, limit = 7) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (!clean) throw new Error("O PDF não contém texto detectável para resumir.");
  const sentences = clean
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 30);
  if (sentences.length <= limit) return sentences.join("\n\n");
  const frequency = new Map();
  for (const token of normalizeText(clean).split(" ")) {
    if (token.length < 3 || stopWords.has(token)) continue;
    frequency.set(token, (frequency.get(token) || 0) + 1);
  }
  const ranked = sentences.map((sentence, index) => {
    const tokens = normalizeText(sentence).split(" ").filter(Boolean);
    const score =
      tokens.reduce((sum, token) => sum + (frequency.get(token) || 0), 0) /
      Math.max(8, tokens.length);
    return { sentence, index, score };
  });
  return ranked
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .sort((a, b) => a.index - b.index)
    .map((item) => item.sentence)
    .join("\n\n");
}

export async function createPdfA2bFromJpegs(pages, iccBytes, title) {
  if (!pages.length || !iccBytes?.byteLength) {
    throw new Error("Não foi possível preparar o perfil de cor do PDF/A.");
  }
  const document = await PDFDocument.create();
  document.setTitle(title || "Documento arquivado");
  document.setProducer("PL Studio PDF/A-2b local");
  document.setCreator("PL Studio");
  document.setCreationDate(new Date());
  document.setModificationDate(new Date());
  for (const source of pages) {
    const image = await document.embedJpg(source.bytes);
    const page = document.addPage([source.width, source.height]);
    page.drawImage(image, { x: 0, y: 0, width: source.width, height: source.height });
  }

  const context = document.context;
  const profileStream = context.flateStream(new Uint8Array(iccBytes), {
    N: 3,
    Alternate: PDFName.of("DeviceRGB"),
  });
  const profileRef = context.register(profileStream);
  const outputIntent = context.obj({
    Type: PDFName.of("OutputIntent"),
    S: PDFName.of("GTS_PDFA1"),
    OutputConditionIdentifier: PDFString.of("sRGB IEC61966-2.1"),
    RegistryName: PDFString.of("http://www.color.org"),
    Info: PDFString.of("sRGB IEC61966-2.1"),
    DestOutputProfile: profileRef,
  });
  const outputIntentRef = context.register(outputIntent);
  document.catalog.set(
    PDFName.of("OutputIntents"),
    context.obj([outputIntentRef]),
  );

  const now = new Date().toISOString();
  const xmp = `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/" xmlns:xmp="http://ns.adobe.com/xap/1.0/" xmlns:dc="http://purl.org/dc/elements/1.1/"><pdfaid:part>2</pdfaid:part><pdfaid:conformance>B</pdfaid:conformance><xmp:CreateDate>${now}</xmp:CreateDate><xmp:ModifyDate>${now}</xmp:ModifyDate><dc:title><rdf:Alt><rdf:li xml:lang="x-default">${String(title || "Documento arquivado").replace(/[<>&]/g, " ")}</rdf:li></rdf:Alt></dc:title></rdf:Description></rdf:RDF></x:xmpmeta>
<?xpacket end="w"?>`;
  const metadataStream = context.stream(new TextEncoder().encode(xmp), {
    Type: PDFName.of("Metadata"),
    Subtype: PDFName.of("XML"),
  });
  document.catalog.set(PDFName.of("Metadata"), context.register(metadataStream));
  return document.save({ useObjectStreams: false });
}
