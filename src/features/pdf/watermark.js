import { PDFDocument, StandardFonts, degrees, rgb } from "pdf-lib";

const fonts = {
  helvetica: { normal: StandardFonts.Helvetica, bold: StandardFonts.HelveticaBold, italic: StandardFonts.HelveticaOblique, boldItalic: StandardFonts.HelveticaBoldOblique },
  times: { normal: StandardFonts.TimesRoman, bold: StandardFonts.TimesRomanBold, italic: StandardFonts.TimesRomanItalic, boldItalic: StandardFonts.TimesRomanBoldItalic },
  courier: { normal: StandardFonts.Courier, bold: StandardFonts.CourierBold, italic: StandardFonts.CourierOblique, boldItalic: StandardFonts.CourierBoldOblique },
};

const toColor = (value) => {
  const hex = /^#?([\da-f]{6})$/i.exec(String(value || ""))?.[1] || "333333";
  return rgb(parseInt(hex.slice(0, 2), 16) / 255, parseInt(hex.slice(2, 4), 16) / 255, parseInt(hex.slice(4, 6), 16) / 255);
};

function anchor(pageWidth, pageHeight, itemWidth, itemHeight, position, margin = 28) {
  const [vertical, horizontal] = String(position || "center-center").split("-");
  const x = horizontal === "left" ? margin : horizontal === "right" ? pageWidth - margin - itemWidth : (pageWidth - itemWidth) / 2;
  const y = vertical === "top" ? pageHeight - margin - itemHeight : vertical === "bottom" ? margin : (pageHeight - itemHeight) / 2;
  return { x, y };
}

function moveLastContentStreamBelow(page) {
  const contents = page.node.Contents();
  if (!contents || contents.size() < 2) return;
  const last = contents.get(contents.size() - 1);
  contents.remove(contents.size() - 1);
  contents.insert(0, last);
}

export async function addWatermark(bytes, options = {}) {
  const document = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const pages = document.getPages();
  const firstPage = Math.max(1, Math.min(pages.length, Math.round(Number(options.fromPage) || 1)));
  const lastPage = Math.max(firstPage, Math.min(pages.length, Math.round(Number(options.toPage) || pages.length)));
  const opacity = Math.max(0.03, Math.min(1, Number(options.opacity) || 0.35));
  const rotation = Math.max(-180, Math.min(180, Number(options.rotation) || 0));
  const angle = degrees(rotation);
  const radians = rotation * Math.PI / 180;
  const color = toColor(options.color);
  const isImage = options.kind === "image" && options.imageBytes;
  let image;
  let font;

  if (isImage) {
    const type = String(options.imageType || "").toLowerCase();
    image = type.includes("png") ? await document.embedPng(options.imageBytes) : await document.embedJpg(options.imageBytes);
  } else {
    const style = options.bold && options.italic ? "boldItalic" : options.bold ? "bold" : options.italic ? "italic" : "normal";
    font = await document.embedFont((fonts[options.fontFamily] || fonts.helvetica)[style]);
  }

  pages.forEach((page, index) => {
    if (index + 1 < firstPage || index + 1 > lastPage) return;
    const pageWidth = page.getWidth();
    const pageHeight = page.getHeight();
    const fontSize = Math.max(8, Math.min(144, Number(options.fontSize) || 42));
    const text = String(options.text || "Marca d'água");
    const imageWidth = isImage ? Math.min(pageWidth * 0.8, pageWidth * Math.max(0.05, Math.min(0.8, Number(options.imageScale) || 0.28))) : 0;
    const imageHeight = isImage ? imageWidth * image.height / image.width : 0;
    const itemWidth = isImage ? imageWidth : font.widthOfTextAtSize(text, fontSize);
    const itemHeight = isImage ? imageHeight : fontSize;
    const points = options.mosaic
      ? Array.from({ length: Math.max(1, Math.ceil(pageHeight / Math.max(itemHeight * 3, 120))) }, (_, row) =>
          Array.from({ length: Math.max(1, Math.ceil(pageWidth / Math.max(itemWidth * 1.8, 180))) }, (_, column) => ({
            x: 30 + column * Math.max(itemWidth * 1.8, 180),
            y: 35 + row * Math.max(itemHeight * 3, 120),
          }))).flat()
      : [anchor(pageWidth, pageHeight, itemWidth, itemHeight, options.position, 28)];

    points.forEach(({ x, y }) => {
      if (isImage) page.drawImage(image, { x, y, width: imageWidth, height: imageHeight, opacity, rotate: angle });
      else {
        page.drawText(text, { x, y, size: fontSize, font, color, opacity, rotate: angle });
        if (options.underline) {
          const offsetX = 2 * Math.sin(radians);
          const offsetY = -2 * Math.cos(radians);
          page.drawLine({ start: { x: x + offsetX, y: y + offsetY }, end: { x: x + offsetX + itemWidth * Math.cos(radians), y: y + offsetY + itemWidth * Math.sin(radians) }, thickness: Math.max(0.7, fontSize / 18), color, opacity });
        }
      }
    });
    if (options.layer === "below") moveLastContentStreamBelow(page);
  });
  document.setModificationDate(new Date());
  return document.save();
}
