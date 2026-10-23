const { parentPort, workerData } = require("worker_threads");
const sharp = require("sharp");

const clampByte = (value) => Math.max(0, Math.min(255, Math.round(value)));
const colorDistance = (data, offset, color) => {
  const r = data[offset] - color[0];
  const g = data[offset + 1] - color[1];
  const b = data[offset + 2] - color[2];
  return r * r + g * g + b * b;
};

function legacyFillSmallHoles(rgba, width, height, channels) {
  const output = Buffer.from(rgba),
    total = width * height,
    visited = new Uint8Array(total),
    queue = new Int32Array(total),
    maxArea = Math.max(32, Math.round(total * 0.0008));
  for (let start = 0; start < total; start += 1) {
    if (visited[start] || output[start * channels + 3] > 24) continue;
    let head = 0,
      tail = 0,
      touchesBorder = false;
    queue[tail++] = start;
    visited[start] = 1;
    while (head < tail) {
      const point = queue[head++],
        x = point % width,
        y = Math.floor(point / width);
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1)
        touchesBorder = true;
      const neighbors = [point - 1, point + 1, point - width, point + width];
      for (const next of neighbors) {
        if (next < 0 || next >= total || visited[next]) continue;
        const nx = next % width,
          ny = Math.floor(next / width);
        if (
          Math.abs(nx - x) + Math.abs(ny - y) !== 1 ||
          output[next * channels + 3] > 24
        )
          continue;
        visited[next] = 1;
        queue[tail++] = next;
      }
    }
    if (!touchesBorder && tail <= maxArea)
      for (let index = 0; index < tail; index += 1)
        output[queue[index] * channels + 3] = 255;
  }
  return output;
}

function refineUncertainEdges(original, rgba, alpha, width, height) {
  const refined = Uint8Array.from(alpha),
    radius = 2;
  for (let y = radius; y < height - radius; y += 1) {
    for (let x = radius; x < width - radius; x += 1) {
      const point = y * width + x,
        currentAlpha = alpha[point];
      if (currentAlpha <= 8 || currentAlpha >= 247) continue;
      const foreground = [0, 0, 0],
        background = [0, 0, 0];
      let foregroundCount = 0,
        backgroundCount = 0;
      for (let ny = y - radius; ny <= y + radius; ny += 1) {
        for (let nx = x - radius; nx <= x + radius; nx += 1) {
          const neighbor = ny * width + nx,
            neighborAlpha = alpha[neighbor],
            offset = neighbor * 4;
          if (neighborAlpha >= 248) {
            foreground[0] += original[offset];
            foreground[1] += original[offset + 1];
            foreground[2] += original[offset + 2];
            foregroundCount += 1;
          } else if (neighborAlpha <= 7) {
            background[0] += original[offset];
            background[1] += original[offset + 1];
            background[2] += original[offset + 2];
            backgroundCount += 1;
          }
        }
      }
      if (foregroundCount < 2 || backgroundCount < 2) continue;
      for (let channel = 0; channel < 3; channel += 1) {
        foreground[channel] /= foregroundCount;
        background[channel] /= backgroundCount;
      }
      const offset = point * 4,
        foregroundDistance = colorDistance(original, offset, foreground),
        backgroundDistance = colorDistance(original, offset, background),
        denominator = foregroundDistance + backgroundDistance;
      if (denominator < 1) continue;
      const guidedAlpha = (backgroundDistance / denominator) * 255,
        difference = guidedAlpha - currentAlpha;
      // A influência é deliberadamente pequena e só existe na faixa incerta.
      if (Math.abs(difference) >= 18)
        refined[point] = clampByte(currentAlpha + difference * 0.22);
    }
  }
  return refined;
}

function cleanPortraitEdgeSpill(original, alpha, width, height, enabled) {
  if (!enabled) return Uint8Array.from(alpha);
  const output = Uint8Array.from(alpha),
    total = width * height,
    depth = new Uint8Array(total),
    queued = new Uint8Array(total),
    queue = new Int32Array(total),
    maxDepth = Math.max(4, Math.min(12, Math.round(Math.min(width, height) * 0.009)));
  let head = 0,
    tail = 0;

  // O fundo que o próprio modelo marcou como transparente é a única semente.
  // A limpeza avança por cor local, sem contrair globalmente a silhueta.
  for (let point = 0; point < total; point += 1) {
    if (output[point] > 6) continue;
    queue[tail++] = point;
    queued[point] = 1;
  }
  while (head < tail) {
    const point = queue[head++],
      x = point % width,
      y = Math.floor(point / width),
      nextDepth = depth[point] + 1;
    if (nextDepth > maxDepth) continue;
    for (const next of [point - 1, point + 1, point - width, point + width]) {
      if (next < 0 || next >= total || queued[next]) continue;
      const nx = next % width,
        ny = Math.floor(next / width);
      if (Math.abs(nx - x) + Math.abs(ny - y) !== 1) continue;
      const currentAlpha = output[next],
        distance = Math.sqrt(
          colorDistance(original, next * 4, [
            original[point * 4],
            original[point * 4 + 1],
            original[point * 4 + 2],
          ]),
        ),
        // Pixels que o modelo julgou opacos exigem uma coincidência de cor
        // muito mais forte; isso protege pele, cabelo, roupa e acessórios.
        limit = currentAlpha >= 240 ? 15 : currentAlpha >= 160 ? 23 : 32;
      if (distance > limit) continue;
      const strength = clampByte(
        255 * (1 - distance / Math.max(1, limit)),
      );
      output[next] = Math.min(
        currentAlpha,
        clampByte(currentAlpha * (1 - (strength / 255) * 0.92)),
      );
      if (output[next] > 42 && currentAlpha >= 240) continue;
      depth[next] = nextDepth;
      queued[next] = 1;
      queue[tail++] = next;
    }
  }
  return output;
}

function cleanIsolatedResidue(alpha, width, height, level) {
  if (!level) return Uint8Array.from(alpha);
  const output = Uint8Array.from(alpha),
    total = width * height,
    visited = new Uint8Array(total),
    queue = new Int32Array(total),
    components = [];
  for (let start = 0; start < total; start += 1) {
    if (visited[start] || alpha[start] < 18) continue;
    let head = 0,
      tail = 0,
      alphaSum = 0,
      maxAlpha = 0,
      minX = width,
      minY = height,
      maxX = 0,
      maxY = 0;
    queue[tail++] = start;
    visited[start] = 1;
    while (head < tail) {
      const point = queue[head++],
        x = point % width,
        y = Math.floor(point / width),
        value = alpha[point];
      alphaSum += value;
      maxAlpha = Math.max(maxAlpha, value);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      for (const next of [point - 1, point + 1, point - width, point + width]) {
        if (next < 0 || next >= total || visited[next] || alpha[next] < 18)
          continue;
        const nx = next % width,
          ny = Math.floor(next / width);
        if (Math.abs(nx - x) + Math.abs(ny - y) !== 1) continue;
        visited[next] = 1;
        queue[tail++] = next;
      }
    }
    components.push({
      points: Int32Array.from(queue.subarray(0, tail)),
      area: tail,
      averageAlpha: alphaSum / tail,
      maxAlpha,
      minX,
      minY,
      maxX,
      maxY,
    });
  }
  if (components.length < 2) return output;
  const substantialArea = Math.max(24, Math.round(total * 0.00035)),
    largestArea = Math.max(...components.map((component) => component.area)),
    anchors = components.filter(
      (component) =>
        component.area >= substantialArea || component.area === largestArea,
    ),
    tinyArea = Math.max(
      5,
      Math.round(total * (level === 2 ? 0.00004 : 0.000015)),
    ),
    safeDistance = Math.max(4, Math.round(Math.min(width, height) * 0.012));
  const distanceToBox = (component, anchor) => {
    const dx = Math.max(
      anchor.minX - component.maxX,
      component.minX - anchor.maxX,
      0,
    );
    const dy = Math.max(
      anchor.minY - component.maxY,
      component.minY - anchor.maxY,
      0,
    );
    return Math.hypot(dx, dy);
  };
  for (const component of components) {
    if (anchors.includes(component) || component.area > tinyArea) continue;
    const distance = Math.min(
      ...anchors.map((anchor) => distanceToBox(component, anchor)),
    );
    // Um fio solto próximo ao sujeito é preservado. Só removemos fragmentos
    // minúsculos, distantes e majoritariamente semitransparentes.
    if (
      distance > safeDistance &&
      component.averageAlpha < (level === 2 ? 145 : 105) &&
      component.maxAlpha < (level === 2 ? 245 : 220)
    )
      for (const point of component.points) output[point] = 0;
  }
  return output;
}

function decontaminateEdgeColors(original, alpha, width, height, enabled) {
  const output = Buffer.from(original);
  if (!enabled) return output;
  const radius = 3;
  for (let y = radius; y < height - radius; y += 1) {
    for (let x = radius; x < width - radius; x += 1) {
      const point = y * width + x,
        aByte = alpha[point];
      if (aByte < 32 || aByte > 242) continue;
      const background = [0, 0, 0];
      let count = 0;
      for (let ny = y - radius; ny <= y + radius; ny += 1) {
        for (let nx = x - radius; nx <= x + radius; nx += 1) {
          const neighbor = ny * width + nx;
          if (alpha[neighbor] > 6) continue;
          const offset = neighbor * 4;
          background[0] += original[offset];
          background[1] += original[offset + 1];
          background[2] += original[offset + 2];
          count += 1;
        }
      }
      if (count < 3) continue;
      for (let channel = 0; channel < 3; channel += 1)
        background[channel] /= count;
      const offset = point * 4,
        alphaValue = aByte / 255;
      for (let channel = 0; channel < 3; channel += 1) {
        const observed = original[offset + channel],
          estimated = clampByte(
            (observed - (1 - alphaValue) * background[channel]) / alphaValue,
          );
        output[offset + channel] = clampByte(
          observed * 0.65 + estimated * 0.35,
        );
      }
    }
  }
  return output;
}

async function pngFromRgba(data, width, height) {
  return sharp(data, { raw: { width, height, channels: 4 } })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

async function pngFromAlpha(alpha, width, height) {
  return sharp(Buffer.from(alpha), { raw: { width, height, channels: 1 } })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

async function run() {
  const originalInput = Buffer.from(workerData.original),
    rawInput = Buffer.from(workerData.raw),
    options = workerData.options || {},
    originalResult = await sharp(originalInput)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true }),
    rawResult = await sharp(rawInput)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
  if (
    originalResult.info.width !== rawResult.info.width ||
    originalResult.info.height !== rawResult.info.height
  )
    throw new Error("A máscara e a imagem original perderam o alinhamento.");
  const { width, height } = rawResult.info,
    original = originalResult.data,
    rawRgba = rawResult.data,
    originalAlpha = new Uint8Array(width * height);
  for (let point = 0; point < originalAlpha.length; point += 1)
    originalAlpha[point] = rawRgba[point * 4 + 3];
  let refinedAlpha =
    options.edgeRefine === false
      ? Uint8Array.from(originalAlpha)
      : refineUncertainEdges(original, rawRgba, originalAlpha, width, height);
  refinedAlpha = cleanPortraitEdgeSpill(
    original,
    refinedAlpha,
    width,
    height,
    Boolean(options.portraitCleanup),
  );
  refinedAlpha = cleanIsolatedResidue(
    refinedAlpha,
    width,
    height,
    Number(options.cleanupLevel) || 0,
  );
  const finalRgba = decontaminateEdgeColors(
    original,
    refinedAlpha,
    width,
    height,
    Boolean(options.decontaminate),
  );
  for (let point = 0; point < refinedAlpha.length; point += 1)
    finalRgba[point * 4 + 3] = refinedAlpha[point];
  const [finalPng, originalMaskPng, refinedMaskPng, legacyPng] =
    await Promise.all([
      pngFromRgba(finalRgba, width, height),
      pngFromAlpha(originalAlpha, width, height),
      pngFromAlpha(refinedAlpha, width, height),
      pngFromRgba(
        legacyFillSmallHoles(rawRgba, width, height, 4),
        width,
        height,
      ),
    ]);
  parentPort.postMessage({
    finalPng,
    originalMaskPng,
    refinedMaskPng,
    legacyPng,
    width,
    height,
  });
}

run().catch((error) => {
  parentPort.postMessage({ error: error?.message || String(error) });
});
