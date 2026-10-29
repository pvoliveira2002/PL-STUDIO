export const PIX_SIZES = {
  '7x10': { label: '7 × 10 cm', width: 70, height: 100 },
  '9x13': { label: '9 × 13 cm', width: 90, height: 130 },
  '10x15': { label: '10 × 15 cm', width: 100, height: 150 },
  '13x18': { label: '13 × 18 cm', width: 130, height: 180 },
  '15x20': { label: '15 × 20 cm', width: 150, height: 200 },
  a5: { label: 'A5', width: 148, height: 210 },
  a4: { label: 'A4', width: 210, height: 297 },
};

export function calculatePixA4Layout(width, height, gap = 5, margin = 5, quantity = 1) {
  const pageWidth = 210, pageHeight = 297;
  const fit = (w, h) => {
    const columns = Math.max(0, Math.floor((pageWidth - margin * 2 + gap) / (w + gap)));
    const rows = Math.max(0, Math.floor((pageHeight - margin * 2 + gap) / (h + gap)));
    return { width: w, height: h, columns, rows, capacity: columns * rows };
  };
  const normal = fit(width, height), rotated = fit(height, width);
  const selected = rotated.capacity > normal.capacity ? rotated : normal;
  const count = Math.min(Math.max(1, Number(quantity) || 1), selected.capacity || 0);
  const usedWidth = selected.columns * selected.width + Math.max(0, selected.columns - 1) * gap;
  const usedHeight = selected.rows * selected.height + Math.max(0, selected.rows - 1) * gap;
  const startX = (pageWidth - usedWidth) / 2, startY = (pageHeight - usedHeight) / 2;
  const positions = Array.from({ length: count }, (_, index) => ({
    x: startX + (index % selected.columns) * (selected.width + gap),
    y: startY + Math.floor(index / selected.columns) * (selected.height + gap),
    width: selected.width,
    height: selected.height,
  }));
  return { ...selected, count, positions, pageWidth, pageHeight, rotated: selected === rotated };
}
