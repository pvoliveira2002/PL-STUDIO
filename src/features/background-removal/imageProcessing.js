import { clamp } from "../../shared/math.js";

export const loadImage = (src) =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(new Error("Não foi possível carregar a imagem."));
    image.src = src;
  });

export async function trimTransparentImage(src) {
  const image = await loadImage(src);
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(image, 0, 0);
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const { data, width, height } = pixels;
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] > 8) {
        left = Math.min(left, x);
        top = Math.min(top, y);
        right = Math.max(right, x);
        bottom = Math.max(bottom, y);
      }
    }
  }

  if (right < left || bottom < top) {
    return { dataUrl: src, width, height, left: 0, top: 0 };
  }

  const padding = Math.max(2, Math.round(Math.max(width, height) * 0.005));
  left = Math.max(0, left - padding);
  top = Math.max(0, top - padding);
  right = Math.min(width - 1, right + padding);
  bottom = Math.min(height - 1, bottom + padding);

  const crop = document.createElement("canvas");
  crop.width = right - left + 1;
  crop.height = bottom - top + 1;
  crop
    .getContext("2d")
    .drawImage(
      canvas,
      left,
      top,
      crop.width,
      crop.height,
      0,
      0,
      crop.width,
      crop.height,
    );
  return {
    dataUrl: crop.toDataURL("image/png"),
    width: crop.width,
    height: crop.height,
    left,
    top,
  };
}

export async function cropImageRect(src, left, top, width, height) {
  const image = await loadImage(src);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas
    .getContext("2d")
    .drawImage(image, left, top, width, height, 0, 0, width, height);
  return canvas.toDataURL("image/png");
}

export async function cropImage(src, crop) {
  const image = await loadImage(src);
  const left = clamp(crop.left, 0, 90 - crop.right);
  const right = clamp(crop.right, 0, 90 - left);
  const top = clamp(crop.top, 0, 90 - crop.bottom);
  const bottom = clamp(crop.bottom, 0, 90 - top);
  const sx = Math.round((image.naturalWidth * left) / 100);
  const sy = Math.round((image.naturalHeight * top) / 100);
  const width = Math.max(
    1,
    Math.round((image.naturalWidth * (100 - left - right)) / 100),
  );
  const height = Math.max(
    1,
    Math.round((image.naturalHeight * (100 - top - bottom)) / 100),
  );
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas
    .getContext("2d")
    .drawImage(image, sx, sy, width, height, 0, 0, width, height);
  return { dataUrl: canvas.toDataURL("image/png"), width, height };
}

export async function findForegroundTop(src, faceBox) {
  const image = await loadImage(src);
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(image, 0, 0);
  const centerX = faceBox.originX + faceBox.width / 2;
  const scanLeft = Math.max(0, Math.floor(centerX - faceBox.width * 1.35));
  const scanRight = Math.min(
    canvas.width - 1,
    Math.ceil(centerX + faceBox.width * 1.35),
  );
  const scanBottom = Math.min(
    canvas.height - 1,
    Math.ceil(faceBox.originY + faceBox.height * 0.7),
  );
  const pixels = ctx.getImageData(
    scanLeft,
    0,
    scanRight - scanLeft + 1,
    scanBottom + 1,
  );

  for (let y = 0; y < pixels.height; y += 1) {
    let opaqueCount = 0;
    for (let x = 0; x < pixels.width; x += 1) {
      if (pixels.data[(y * pixels.width + x) * 4 + 3] > 24) opaqueCount += 1;
    }
    if (opaqueCount >= Math.max(3, Math.round(faceBox.width * 0.025))) return y;
  }
  return faceBox.originY;
}

export function drawWithContour(
  ctx,
  image,
  width,
  height,
  enabled,
  color,
  thicknessPx,
) {
  if (enabled && thicknessPx > 0) {
    const mask = document.createElement("canvas");
    mask.width = image.naturalWidth;
    mask.height = image.naturalHeight;
    const maskCtx = mask.getContext("2d");
    maskCtx.drawImage(image, 0, 0);
    maskCtx.globalCompositeOperation = "source-in";
    maskCtx.fillStyle = color;
    maskCtx.fillRect(0, 0, mask.width, mask.height);
    for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 10) {
      ctx.drawImage(
        mask,
        Math.cos(angle) * thicknessPx,
        Math.sin(angle) * thicknessPx,
        width,
        height,
      );
    }
  }
  ctx.drawImage(image, 0, 0, width, height);
}
