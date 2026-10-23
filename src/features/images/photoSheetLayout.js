export const PRINT_DPI = 300;
export const A4_PORTRAIT_MM = Object.freeze({ width: 210, height: 297 });
export const A6_LANDSCAPE_MM = Object.freeze({ width: 148, height: 105 });

export const mmToPixels = (millimeters, dpi = PRINT_DPI) =>
  Math.round((Number(millimeters) * dpi) / 25.4);

export function createPhotoSheetLayout({
  page = "a4",
  photoWidth,
  photoHeight,
  copies = 1,
}) {
  const pageSize = page === "a6" ? A6_LANDSCAPE_MM : A4_PORTRAIT_MM;
  const width = Math.max(1, Number(photoWidth) || 30);
  const height = Math.max(1, Number(photoHeight) || 40);
  if (width > pageSize.width || height > pageSize.height) {
    return {
      page,
      pageWidth: pageSize.width,
      pageHeight: pageSize.height,
      photoWidth: width,
      photoHeight: height,
      columns: 0,
      rows: 0,
      capacity: 0,
      count: 0,
      gapX: 0,
      gapY: 0,
      positions: [],
    };
  }
  const minimumGap = 2;
  const columns = Math.max(
    1,
    Math.floor((pageSize.width + minimumGap) / (width + minimumGap)),
  );
  const rows = Math.max(
    1,
    Math.floor((pageSize.height + minimumGap) / (height + minimumGap)),
  );
  const capacity = columns * rows;
  const gapX = (pageSize.width - columns * width) / (columns + 1);
  const gapY = (pageSize.height - rows * height) / (rows + 1);
  const count = Math.min(Math.max(1, Math.round(Number(copies) || 1)), capacity);
  const positions = Array.from({ length: count }, (_, index) => ({
    x: gapX + (index % columns) * (width + gapX),
    y: gapY + Math.floor(index / columns) * (height + gapY),
    width,
    height,
  }));

  return {
    page,
    pageWidth: pageSize.width,
    pageHeight: pageSize.height,
    photoWidth: width,
    photoHeight: height,
    columns,
    rows,
    capacity,
    count,
    gapX,
    gapY,
    positions,
  };
}
