export const readDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error("Falha ao ler a imagem."));
    reader.readAsDataURL(file);
  });

export const loadImage = (src) =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Falha ao carregar a imagem."));
    image.src = src;
  });

export function calculateCenterCrop(width, height, ratio) {
  if (width <= 0 || height <= 0 || ratio <= 0) {
    throw new RangeError("Dimensões e proporção devem ser maiores que zero.");
  }

  let sourceWidth = width;
  let sourceHeight = height;
  let sourceX = 0;
  let sourceY = 0;

  if (sourceWidth / sourceHeight > ratio) {
    const nextWidth = sourceHeight * ratio;
    sourceX = (sourceWidth - nextWidth) / 2;
    sourceWidth = nextWidth;
  } else {
    const nextHeight = sourceWidth / ratio;
    sourceY = (sourceHeight - nextHeight) / 2;
    sourceHeight = nextHeight;
  }

  return { sourceX, sourceY, sourceWidth, sourceHeight };
}

export async function cropImage(file, ratio) {
  const src = await readDataUrl(file);
  const image = await loadImage(src);
  const crop = calculateCenterCrop(image.width, image.height, ratio);
  const canvas = document.createElement("canvas");
  canvas.width = 900;
  canvas.height = Math.round(900 / ratio);
  canvas
    .getContext("2d")
    .drawImage(
      image,
      crop.sourceX,
      crop.sourceY,
      crop.sourceWidth,
      crop.sourceHeight,
      0,
      0,
      canvas.width,
      canvas.height,
    );
  return canvas.toDataURL("image/jpeg", 0.94);
}

export async function renderPhotoSheet(file, layout, dpi = 300) {
  const src = await readDataUrl(file);
  const image = await loadImage(src);
  const crop = calculateCenterCrop(
    image.width,
    image.height,
    layout.photoWidth / layout.photoHeight,
  );
  const pxPerMm = dpi / 25.4;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(layout.pageWidth * pxPerMm);
  canvas.height = Math.round(layout.pageHeight * pxPerMm);
  const context = canvas.getContext("2d");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";

  layout.positions.forEach((position) => {
    const x = Math.round(position.x * pxPerMm);
    const y = Math.round(position.y * pxPerMm);
    const width = Math.round(position.width * pxPerMm);
    const height = Math.round(position.height * pxPerMm);
    context.drawImage(
      image,
      crop.sourceX,
      crop.sourceY,
      crop.sourceWidth,
      crop.sourceHeight,
      x,
      y,
      width,
      height,
    );
    context.strokeStyle = "#bdbdbd";
    context.lineWidth = Math.max(1, Math.round(0.15 * pxPerMm));
    context.strokeRect(x, y, width, height);
  });

  return await new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Não foi possível montar a folha A6."))),
      "image/png",
    ),
  );
}
