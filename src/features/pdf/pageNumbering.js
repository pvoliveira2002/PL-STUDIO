import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const fontNames = {
  helvetica: {
    normal: StandardFonts.Helvetica,
    bold: StandardFonts.HelveticaBold,
    italic: StandardFonts.HelveticaOblique,
    boldItalic: StandardFonts.HelveticaBoldOblique,
  },
  times: {
    normal: StandardFonts.TimesRoman,
    bold: StandardFonts.TimesRomanBold,
    italic: StandardFonts.TimesRomanItalic,
    boldItalic: StandardFonts.TimesRomanBoldItalic,
  },
  courier: {
    normal: StandardFonts.Courier,
    bold: StandardFonts.CourierBold,
    italic: StandardFonts.CourierOblique,
    boldItalic: StandardFonts.CourierBoldOblique,
  },
};

export function pageNumberLabel(number, total, format = "number") {
  if (format === "page") return `Página ${number}`;
  if (format === "total") return `${number} de ${total}`;
  if (format === "page-total") return `Página ${number} de ${total}`;
  return String(number);
}

export function effectivePosition(position, duplex, pageIndex) {
  if (!duplex || pageIndex % 2 === 0) return position;
  return position.replace("left", "temporary").replace("right", "left").replace("temporary", "right");
}

const hexColor = (value) => {
  const match = /^#?([0-9a-f]{6})$/i.exec(String(value || ""));
  const hex = match?.[1] || "222222";
  return rgb(parseInt(hex.slice(0, 2), 16) / 255, parseInt(hex.slice(2, 4), 16) / 255, parseInt(hex.slice(4, 6), 16) / 255);
};

export async function addPageNumbers(bytes, options = {}) {
  const document = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const style = options.bold && options.italic ? "boldItalic" : options.bold ? "bold" : options.italic ? "italic" : "normal";
  const family = fontNames[options.fontFamily] || fontNames.helvetica;
  const font = await document.embedFont(family[style]);
  const pages = document.getPages();
  const start = Math.max(-9999, Math.min(999999, Math.round(Number(options.start) || 1)));
  const size = Math.max(6, Math.min(72, Number(options.fontSize) || 11));
  const margin = Math.max(2, Math.min(144, Number(options.marginPt) || 28));
  pages.forEach((page, index) => {
    const number = start + index;
    const label = pageNumberLabel(number, start + pages.length - 1, options.format);
    const width = font.widthOfTextAtSize(label, size);
    const [vertical, horizontal] = effectivePosition(options.position || "bottom-center", Boolean(options.duplex), index).split("-");
    const x = horizontal === "left" ? margin : horizontal === "right" ? page.getWidth() - margin - width : (page.getWidth() - width) / 2;
    const y = vertical === "top" ? page.getHeight() - margin - size : vertical === "center" ? (page.getHeight() - size) / 2 : margin;
    const color = hexColor(options.color);
    page.drawText(label, { x, y, size, font, color });
    if (options.underline) page.drawLine({ start: { x, y: y - 2 }, end: { x: x + width, y: y - 2 }, thickness: Math.max(0.6, size / 14), color });
  });
  document.setModificationDate(new Date());
  return document.save();
}
