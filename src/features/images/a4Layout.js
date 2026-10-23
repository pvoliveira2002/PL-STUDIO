export const A4_PAGE_MM = Object.freeze({ width: 210, height: 297 });

const ROWS_BY_COLUMNS = Object.freeze({ 2: 3, 3: 5, 4: 7 });

export function createA4ImageGrid(columns, { margin = 10, gap = 4 } = {}) {
  const columnCount = Math.min(4, Math.max(2, Math.round(Number(columns) || 2)));
  const rows = ROWS_BY_COLUMNS[columnCount];
  const usableWidth = A4_PAGE_MM.width - margin * 2;
  const usableHeight = A4_PAGE_MM.height - margin * 2;
  const cellWidth = (usableWidth - gap * (columnCount - 1)) / columnCount;
  const cellHeight = (usableHeight - gap * (rows - 1)) / rows;

  return {
    pageWidth: A4_PAGE_MM.width,
    pageHeight: A4_PAGE_MM.height,
    margin,
    gap,
    columns: columnCount,
    rows,
    cellWidth,
    cellHeight,
    perPage: columnCount * rows,
  };
}

export function getA4GridSlot(layout, index) {
  const slot = index % layout.perPage;
  const column = slot % layout.columns;
  const row = Math.floor(slot / layout.columns);
  return {
    x: layout.margin + column * (layout.cellWidth + layout.gap),
    y: layout.margin + row * (layout.cellHeight + layout.gap),
    width: layout.cellWidth,
    height: layout.cellHeight,
  };
}

export function containInBox(sourceWidth, sourceHeight, box) {
  const scale = Math.min(box.width / sourceWidth, box.height / sourceHeight);
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  return {
    x: box.x + (box.width - width) / 2,
    y: box.y + (box.height - height) / 2,
    width,
    height,
  };
}
