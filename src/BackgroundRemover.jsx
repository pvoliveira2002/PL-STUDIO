import React, { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  Crop,
  Download,
  Eraser,
  ImagePlus,
  LoaderCircle,
  Maximize2,
  Paintbrush,
  Printer,
  ScanFace,
  ShieldCheck,
  Sparkles,
  UploadCloud,
  Undo2,
  Redo2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  MAX_INPUT_FILE_SIZE as MAX_FILE_SIZE,
  downloadFile as downloadBlob,
  fileStem,
} from "./shared/files";
import { getFaceDetector } from "./features/background-removal/faceDetector";
import {
  cropImage,
  cropImageRect,
  drawWithContour,
  findForegroundTop,
  loadImage,
  trimTransparentImage,
} from "./features/background-removal/imageProcessing";
import { clamp } from "./shared/math";

const A6 = { width: 148, height: 105 };
const CUTTER_PRESET = { width: 3.2, height: 4 };
const acceptedExtensions = new Set(["jpg", "jpeg", "png", "jfif"]);
const friendlyError = (error) =>
  String(error?.message || error || "").replace(
    /^Error invoking remote method '[^']+': Error:\s*/,
    "",
  ) || "Não foi possível remover o fundo desta imagem.";
export default function BackgroundRemover({ onClose, onDone }) {
  const input = useRef(null),
    editCanvas = useRef(null),
    originalPixels = useRef(null),
    painting = useRef(false),
    lastPoint = useRef(null),
    printDrag = useRef(null),
    cropDrag = useRef(null),
    cropBaseSize = useRef({ width: 10, height: 7 }),
    undoStack = useRef([]),
    redoStack = useRef([]);
  const [file, setFile] = useState(null),
    [original, setOriginal] = useState(""),
    [result, setResult] = useState(""),
    [printResult, setPrintResult] = useState(""),
    [layoutResult, setLayoutResult] = useState(""),
    [imageSize, setImageSize] = useState(null),
    [printSize, setPrintSize] = useState(null),
    [layoutSize, setLayoutSize] = useState(null),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(0),
    [error, setError] = useState(""),
    [success, setSuccess] = useState(""),
    [dragging, setDragging] = useState(false);
  const [editMode, setEditMode] = useState("erase"),
    [brushSize, setBrushSize] = useState(32),
    [brushHardness, setBrushHardness] = useState(70),
    [brushIntensity, setBrushIntensity] = useState(55),
    [zoom, setZoom] = useState(1),
    [compare, setCompare] = useState(true),
    [edgeRefine, setEdgeRefine] = useState(true),
    [cleanup, setCleanup] = useState("off"),
    [portraitCleanup, setPortraitCleanup] = useState(true),
    [decontaminate, setDecontaminate] = useState(false),
    [comparisonData, setComparisonData] = useState(null),
    [comparisonBackground, setComparisonBackground] = useState("checker"),
    [previewBackground, setPreviewBackground] = useState("checker"),
    [overlayOriginal, setOverlayOriginal] = useState(false),
    [overlayOpacity, setOverlayOpacity] = useState(35),
    [normalizedOriginal, setNormalizedOriginal] = useState(""),
    [historyVersion, setHistoryVersion] = useState(0);
  const [margin, setMargin] = useState(5),
    [widthCm, setWidthCm] = useState(10),
    [heightCm, setHeightCm] = useState(7),
    [lockRatio, setLockRatio] = useState(true),
    [rotation, setRotation] = useState(0),
    [position, setPosition] = useState({ x: 74, y: 52.5 });
  const [contour, setContour] = useState(false),
    [contourColor, setContourColor] = useState("#777777"),
    [contourWidth, setContourWidth] = useState(0.4),
    [step, setStep] = useState(1);
  const [cropOpen, setCropOpen] = useState(false),
    [crop, setCrop] = useState({ left: 0, right: 0, top: 0, bottom: 0 }),
    [workflow, setWorkflow] = useState("photo"),
    [photoWidth, setPhotoWidth] = useState(CUTTER_PRESET.width),
    [photoHeight, setPhotoHeight] = useState(CUTTER_PRESET.height),
    [framing, setFraming] = useState(false),
    [photoStage, setPhotoStage] = useState(1),
    [sheetPrintData, setSheetPrintData] = useState(""),
    [showPrintAdvanced, setShowPrintAdvanced] = useState(false);

  useEffect(
    () => () => {
      if (original) URL.revokeObjectURL(original);
    },
    [original],
  );
  useEffect(() => {
    if (!result || !editCanvas.current) return;
    let cancelled = false;
    (async () => {
      const image = await loadImage(result);
      if (cancelled) return;
      const canvas = editCanvas.current,
        ctx = canvas.getContext("2d", { willReadFrequently: true });
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0);
    })().catch((error) => setError(error.message));
    return () => {
      cancelled = true;
    };
  }, [result]);
  useEffect(() => {
    if (!result) return;
    let cancelled = false;
    trimTransparentImage(result)
      .then((trimmed) => {
        if (!cancelled) {
          setPrintResult(trimmed.dataUrl);
          setPrintSize({ width: trimmed.width, height: trimmed.height });
        }
      })
      .catch((error) => setError(error.message));
    return () => {
      cancelled = true;
    };
  }, [result]);
  useEffect(() => {
    if (!printResult) return;
    let cancelled = false;
    cropImage(printResult, crop)
      .then((cropped) => {
        if (cancelled) return;
        setLayoutResult(cropped.dataUrl);
        setLayoutSize({ width: cropped.width, height: cropped.height });
      })
      .catch((error) => setError(error.message));
    return () => {
      cancelled = true;
    };
  }, [printResult, crop]);

  const fitToPage = (
    width = layoutSize?.width,
    height = layoutSize?.height,
    nextMargin = margin,
    nextRotation = rotation,
    nextCrop = crop,
  ) => {
    if (!width || !height) return;
    const availableW = (A6.width - nextMargin * 2) / 10,
      availableH = (A6.height - nextMargin * 2) / 10,
      ratio = width / height,
      rad = (Math.abs(nextRotation % 180) * Math.PI) / 180,
      c = Math.abs(Math.cos(rad)),
      s = Math.abs(Math.sin(rad));
    const unitH = Math.min(
      availableW / (ratio * c + s),
      availableH / (ratio * s + c),
    );
    const fittedWidth = Number((ratio * unitH).toFixed(2)),
      fittedHeight = Number(unitH.toFixed(2)),
      remainingX = Math.max(0.01, (100 - nextCrop.left - nextCrop.right) / 100),
      remainingY = Math.max(0.01, (100 - nextCrop.top - nextCrop.bottom) / 100);
    setWidthCm(fittedWidth);
    setHeightCm(fittedHeight);
    cropBaseSize.current = {
      width: fittedWidth / remainingX,
      height: fittedHeight / remainingY,
    };
    setPosition({ x: A6.width / 2, y: A6.height / 2 });
  };

  const choose = (files) => {
    const next = files?.[0];
    if (!next) return;
    const extension = next.name.split(".").pop()?.toLowerCase();
    if (next.size > MAX_FILE_SIZE) {
      setError(`O arquivo "${next.name}" excede o limite de 100 MB.`);
      return;
    }
    if (
      !acceptedExtensions.has(extension) &&
      !["image/jpeg", "image/png"].includes(next.type)
    ) {
      setError("Selecione uma imagem JPG, JPEG, PNG ou JFIF.");
      return;
    }
    if (original) URL.revokeObjectURL(original);
    const url = URL.createObjectURL(next);
    setFile(next);
    setOriginal(url);
    setResult("");
    setPrintResult("");
    setLayoutResult("");
    setImageSize(null);
    setPrintSize(null);
    setLayoutSize(null);
    setComparisonData(null);
    setNormalizedOriginal("");
    undoStack.current = [];
    redoStack.current = [];
    setHistoryVersion((value) => value + 1);
    setCrop({ left: 0, right: 0, top: 0, bottom: 0 });
    setError("");
    setSuccess("");
    setProgress(0);
    setStep(1);
    setPhotoStage(1);
    setRotation(0);
    cropBaseSize.current = { width: 10, height: 7 };
    setPosition({ x: 74, y: 52.5 });
    loadImage(url)
      .then((image) => {
        setImageSize({
          width: image.naturalWidth,
          height: image.naturalHeight,
        });
        const canvas = document.createElement("canvas");
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(image, 0, 0);
        originalPixels.current = ctx.getImageData(
          0,
          0,
          canvas.width,
          canvas.height,
        );
      })
      .catch((error) => setError(error.message));
  };

  const remove = async (autoMount = false) => {
    if (!file) {
      input.current?.click();
      return;
    }
    if (!window.plStudio?.removeBackground) {
      setError("A remoção automática está disponível no aplicativo instalado.");
      return;
    }
    const filePath = window.plStudio.pathForFile(file);
    if (!filePath) {
      setError("Não foi possível acessar o arquivo selecionado.");
      return;
    }
    setBusy(true);
    setError("");
    setSuccess("");
    setProgress(5);
    setStep(2);
    let unsubscribeProgress;
    try {
      unsubscribeProgress = window.plStudio.onBackgroundProgress?.(
        (payload) => {
          if (payload?.key === "refinement") {
            setProgress(payload.current ? 99 : 94);
            return;
          }
          if (payload?.total > 0)
            setProgress(
              Math.min(92, Math.max(6, (payload.current / payload.total) * 92)),
            );
        },
      );
      const response = await window.plStudio.removeBackground(filePath, {
          edgeRefine,
          cleanup,
          portraitCleanup: workflow === "photo" && portraitCleanup,
          decontaminate,
        }),
        trimmed = await trimTransparentImage(response.dataUrl),
        shouldTrimEditor = workflow === "photo",
        editorResult = shouldTrimEditor ? trimmed.dataUrl : response.dataUrl,
        editorOriginal = shouldTrimEditor
          ? await cropImageRect(
              response.originalNormalizedDataUrl,
              trimmed.left,
              trimmed.top,
              trimmed.width,
              trimmed.height,
            )
          : response.originalNormalizedDataUrl;
      const normalizedImage = await loadImage(
          editorOriginal,
        ),
        normalizedCanvas = document.createElement("canvas");
      normalizedCanvas.width = normalizedImage.naturalWidth;
      normalizedCanvas.height = normalizedImage.naturalHeight;
      const normalizedContext = normalizedCanvas.getContext("2d", {
        willReadFrequently: true,
      });
      normalizedContext.drawImage(normalizedImage, 0, 0);
      originalPixels.current = normalizedContext.getImageData(
        0,
        0,
        normalizedCanvas.width,
        normalizedCanvas.height,
      );
      setProgress(100);
      setCrop({ left: 0, right: 0, top: 0, bottom: 0 });
      setResult(editorResult);
      setPrintResult(trimmed.dataUrl);
      setLayoutResult(trimmed.dataUrl);
      setImageSize({
        width: shouldTrimEditor ? trimmed.width : response.width,
        height: shouldTrimEditor ? trimmed.height : response.height,
      });
      setPrintSize({ width: trimmed.width, height: trimmed.height });
      setLayoutSize({ width: trimmed.width, height: trimmed.height });
      setNormalizedOriginal(editorOriginal);
      undoStack.current = [];
      redoStack.current = [];
      setHistoryVersion((value) => value + 1);
      setComparisonData({
        raw: response.rawDataUrl,
        legacy: response.legacyDataUrl,
        refined: response.dataUrl,
        originalMask: response.originalMaskDataUrl,
        refinedMask: response.refinedMaskDataUrl,
        metadata: response.refinement,
      });
      setStep(3);
      if (workflow === "photo") setPhotoStage(2);
      if (autoMount)
        await autoFrameFace(editorResult, editorOriginal);
      else
        setSuccess(
          "Fundo removido. Você já pode corrigir a máscara ou preparar a impressão.",
        );
    } catch (err) {
      setError(friendlyError(err));
      setProgress(0);
      setStep(1);
    } finally {
      unsubscribeProgress?.();
      setBusy(false);
    }
  };

  const paintAt = (event) => {
    if (!painting.current || !editCanvas.current) return;
    const canvas = editCanvas.current,
      rect = canvas.getBoundingClientRect(),
      x = ((event.clientX - rect.left) * canvas.width) / rect.width,
      y = ((event.clientY - rect.top) * canvas.height) / rect.height,
      ctx = canvas.getContext("2d", { willReadFrequently: true }),
      radius = brushSize / 2,
      innerRadius = radius * (brushHardness / 100),
      strength = brushIntensity / 100;
    const drawPoint = (px, py) => {
      if (!originalPixels.current) return;
      const source = originalPixels.current,
        x0 = Math.max(0, Math.floor(px - radius)),
        y0 = Math.max(0, Math.floor(py - radius)),
        x1 = Math.min(canvas.width, Math.ceil(px + radius)),
        y1 = Math.min(canvas.height, Math.ceil(py + radius)),
        current = ctx.getImageData(x0, y0, x1 - x0, y1 - y0);
      for (let iy = 0; iy < current.height; iy += 1) {
        for (let ix = 0; ix < current.width; ix += 1) {
          const dx = x0 + ix - px,
            dy = y0 + iy - py,
            distance = Math.hypot(dx, dy);
          if (distance > radius) continue;
          const edgeRange = Math.max(0.001, radius - innerRadius),
            linear =
              distance <= innerRadius
                ? 1
                : clamp((radius - distance) / edgeRange, 0, 1),
            falloff = linear * linear * (3 - 2 * linear),
            influence = falloff * strength,
            target = (iy * current.width + ix) * 4,
            sourceIndex = ((y0 + iy) * source.width + x0 + ix) * 4,
            currentAlpha = current.data[target + 3],
            sourceAlpha = source.data[sourceIndex + 3];
          // RGB sempre vem da imagem original normalizada. O pincel altera
          // somente a máscara alpha e nunca inventa conteúdo.
          current.data[target] = source.data[sourceIndex];
          current.data[target + 1] = source.data[sourceIndex + 1];
          current.data[target + 2] = source.data[sourceIndex + 2];
          current.data[target + 3] = clamp(
            editMode === "erase"
              ? currentAlpha * (1 - influence)
              : currentAlpha + (sourceAlpha - currentAlpha) * influence,
            0,
            255,
          );
        }
      }
      ctx.putImageData(current, x0, y0);
    };
    const previous = lastPoint.current;
    if (previous) {
      const distance = Math.hypot(x - previous.x, y - previous.y),
        steps = Math.max(1, Math.ceil(distance / Math.max(2, radius / 3)));
      for (let index = 1; index <= steps; index++)
        drawPoint(
          previous.x + ((x - previous.x) * index) / steps,
          previous.y + ((y - previous.y) * index) / steps,
        );
    } else drawPoint(x, y);
    lastPoint.current = { x, y };
  };
  const beginPaint = (event) => {
    if (!editCanvas.current || !originalPixels.current) return;
    const canvas = editCanvas.current,
      ctx = canvas.getContext("2d", { willReadFrequently: true });
    undoStack.current.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    if (undoStack.current.length > 15) undoStack.current.shift();
    redoStack.current = [];
    setHistoryVersion((value) => value + 1);
    painting.current = true;
    lastPoint.current = null;
    event.currentTarget.setPointerCapture(event.pointerId);
    paintAt(event);
  };
  const finishPaint = () => {
    if (!painting.current) return;
    painting.current = false;
    lastPoint.current = null;
    setResult(editCanvas.current.toDataURL("image/png"));
  };
  const applyHistory = (from, to) => {
    const canvas = editCanvas.current;
    if (!canvas || !from.current.length) return;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    to.current.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    const snapshot = from.current.pop();
    ctx.putImageData(snapshot, 0, 0);
    setResult(canvas.toDataURL("image/png"));
    setHistoryVersion((value) => value + 1);
  };

  const updateWidth = (value) => {
    const next = clamp(Number(value) || 0.1, 0.1, 30);
    setWidthCm(next);
    cropBaseSize.current.width =
      next / Math.max(0.01, (100 - crop.left - crop.right) / 100);
    if (lockRatio && layoutSize)
      setHeightCm(() => {
        const height = Number(
          (next / (layoutSize.width / layoutSize.height)).toFixed(2),
        );
        cropBaseSize.current.height =
          height / Math.max(0.01, (100 - crop.top - crop.bottom) / 100);
        return height;
      });
  };
  const updateHeight = (value) => {
    const next = clamp(Number(value) || 0.1, 0.1, 30);
    setHeightCm(next);
    cropBaseSize.current.height =
      next / Math.max(0.01, (100 - crop.top - crop.bottom) / 100);
    if (lockRatio && layoutSize)
      setWidthCm(() => {
        const width = Number(
          (next * (layoutSize.width / layoutSize.height)).toFixed(2),
        );
        cropBaseSize.current.width =
          width / Math.max(0.01, (100 - crop.left - crop.right) / 100);
        return width;
      });
  };
  const applyCrop = (
    nextCrop,
    previousCrop = crop,
    basePosition = position,
  ) => {
    const localX =
        (cropBaseSize.current.width *
          10 *
          (nextCrop.left -
            previousCrop.left -
            (nextCrop.right - previousCrop.right))) /
        200,
      localY =
        (cropBaseSize.current.height *
          10 *
          (nextCrop.top -
            previousCrop.top -
            (nextCrop.bottom - previousCrop.bottom))) /
        200,
      angle = (rotation * Math.PI) / 180;
    setCrop(nextCrop);
    setPosition({
      x: clamp(
        basePosition.x + localX * Math.cos(angle) - localY * Math.sin(angle),
        0,
        A6.width,
      ),
      y: clamp(
        basePosition.y + localX * Math.sin(angle) + localY * Math.cos(angle),
        0,
        A6.height,
      ),
    });
    setWidthCm(
      Number(
        (
          cropBaseSize.current.width *
          ((100 - nextCrop.left - nextCrop.right) / 100)
        ).toFixed(2),
      ),
    );
    setHeightCm(
      Number(
        (
          cropBaseSize.current.height *
          ((100 - nextCrop.top - nextCrop.bottom) / 100)
        ).toFixed(2),
      ),
    );
  };
  const updateCrop = (side, value) => {
    const nextCrop = (() => {
      const current = crop;
      const opposite =
        side === "left"
          ? "right"
          : side === "right"
            ? "left"
            : side === "top"
              ? "bottom"
              : "top";
      return {
        ...current,
        [side]: clamp(Number(value) || 0, 0, 90 - current[opposite]),
      };
    })();
    applyCrop(nextCrop);
  };
  const resetCrop = () => applyCrop({ left: 0, right: 0, top: 0, bottom: 0 });
  const updateMargin = (value) => setMargin(clamp(Number(value) || 0, 0, 20));

  const beginPrintDrag = (event) => {
    if (!result) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    printDrag.current = {
      startX: event.clientX,
      startY: event.clientY,
      position,
    };
  };
  const movePrint = (event) => {
    if (!printDrag.current) return;
    const page = event.currentTarget.closest(".a6-page"),
      rect = page.getBoundingClientRect(),
      deltaX =
        ((event.clientX - printDrag.current.startX) * A6.width) / rect.width,
      deltaY =
        ((event.clientY - printDrag.current.startY) * A6.height) / rect.height;
    setPosition({
      x: clamp(printDrag.current.position.x + deltaX, 0, A6.width),
      y: clamp(printDrag.current.position.y + deltaY, 0, A6.height),
    });
  };
  const endPrintDrag = () => {
    printDrag.current = null;
  };
  const beginCropDrag = (event, horizontal, vertical) => {
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const frame = event.currentTarget.closest(".a6-crop-frame"),
      rect = frame.getBoundingClientRect(),
      remainingX = Math.max(0.01, (100 - crop.left - crop.right) / 100),
      remainingY = Math.max(0.01, (100 - crop.top - crop.bottom) / 100);
    cropDrag.current = {
      startX: event.clientX,
      startY: event.clientY,
      crop: { ...crop },
      fullWidth: rect.width / remainingX,
      fullHeight: rect.height / remainingY,
      horizontal,
      vertical,
      position: { ...position },
    };
  };
  const moveCropHandle = (event) => {
    const drag = cropDrag.current;
    if (!drag) return;
    event.stopPropagation();
    const dx = ((event.clientX - drag.startX) / drag.fullWidth) * 100,
      dy = ((event.clientY - drag.startY) / drag.fullHeight) * 100,
      next = { ...drag.crop };
    if (drag.horizontal === "left")
      next.left = clamp(drag.crop.left + dx, 0, 90 - drag.crop.right);
    if (drag.horizontal === "right")
      next.right = clamp(drag.crop.right - dx, 0, 90 - drag.crop.left);
    if (drag.vertical === "top")
      next.top = clamp(drag.crop.top + dy, 0, 90 - drag.crop.bottom);
    if (drag.vertical === "bottom")
      next.bottom = clamp(drag.crop.bottom - dy, 0, 90 - drag.crop.top);
    applyCrop(
      {
        left: Number(next.left.toFixed(2)),
        right: Number(next.right.toFixed(2)),
        top: Number(next.top.toFixed(2)),
        bottom: Number(next.bottom.toFixed(2)),
      },
      drag.crop,
      drag.position,
    );
  };
  const endCropDrag = (event) => {
    event.stopPropagation();
    cropDrag.current = null;
  };

  const autoFrameFace = async (
    sourceResult = result,
    sourceOriginal = normalizedOriginal || original,
  ) => {
    if (!sourceResult || !sourceOriginal) {
      setError("Remova o fundo antes de enquadrar o rosto.");
      return;
    }
    setFraming(true);
    setError("");
    setSuccess("");
    try {
      const detector = await getFaceDetector(),
        image = await loadImage(sourceOriginal),
        detectionResult = detector.detect(image),
        detections = detectionResult?.detections || [];
      if (!detections.length)
        throw new Error(
          "Nenhum rosto foi encontrado. Use o recorte manual para ajustar a foto.",
        );
      if (detections.length > 1)
        throw new Error(
          "Foram encontrados vários rostos. Use uma foto com uma pessoa ou faça o recorte manual.",
        );
      const detection = detections[0],
        box = detection.boundingBox;
      if (!box) throw new Error("O detector não retornou os limites do rosto.");
      const eyePoints = (detection.keypoints || []).filter((point, index) =>
          point.label ? point.label.toLowerCase().includes("eye") : index < 2,
        ),
        hasEyes = eyePoints.length >= 2,
        orderedEyes = hasEyes
          ? eyePoints.slice(0, 2).sort((a, b) => a.x - b.x)
          : [],
        leftEye = orderedEyes[0],
        rightEye = orderedEyes[1],
        foregroundTop = await findForegroundTop(sourceResult, box),
        imageW = image.naturalWidth,
        imageH = image.naturalHeight,
        targetRatio = photoWidth / photoHeight,
        faceCenterX = hasEyes
          ? ((leftEye.x + rightEye.x) / 2) * imageW
          : box.originX + box.width / 2,
        faceCenterY = box.originY + box.height / 2,
        eyeCenterY = hasEyes
          ? ((leftEye.y + rightEye.y) / 2) * imageH
          : box.originY + box.height * 0.43,
        eyeDistance = hasEyes
          ? Math.hypot(
              (rightEye.x - leftEye.x) * imageW,
              (rightEye.y - leftEye.y) * imageH,
            )
          : box.width * 0.43,
        eyeAngle = hasEyes
          ? (Math.atan2(
              (rightEye.y - leftEye.y) * imageH,
              (rightEye.x - leftEye.x) * imageW,
            ) *
              180) /
            Math.PI
          : 0,
        eyeLinePosition = 0.39,
        faceBasedHeight = Math.max(
          box.height / 0.55,
          box.width / (targetRatio * 0.62),
          eyeDistance / (targetRatio * 0.28),
        ),
        previousBottom = faceCenterY + box.height * 0.17 + faceBasedHeight / 2,
        safeHairTop = Math.max(0, foregroundTop - box.height * 0.12),
        idealHeight = Math.max(
          faceBasedHeight,
          (eyeCenterY - safeHairTop) / eyeLinePosition,
          (previousBottom - eyeCenterY) / (1 - eyeLinePosition),
        ),
        frameHeight = Math.min(idealHeight, imageH, imageW / targetRatio),
        frameWidth = frameHeight * targetRatio,
        centerX = clamp(faceCenterX, frameWidth / 2, imageW - frameWidth / 2),
        top = clamp(
          eyeCenterY - frameHeight * eyeLinePosition,
          0,
          imageH - frameHeight,
        ),
        centerY = clamp(
          top + frameHeight / 2,
          frameHeight / 2,
          imageH - frameHeight / 2,
        ),
        left = centerX - frameWidth / 2,
        nextCrop = {
          left: Number(((left / imageW) * 100).toFixed(2)),
          right: Number(
            (((imageW - left - frameWidth) / imageW) * 100).toFixed(2),
          ),
          top: Number(((top / imageH) * 100).toFixed(2)),
          bottom: Number(
            (((imageH - top - frameHeight) / imageH) * 100).toFixed(2),
          ),
        },
        remainingX = (100 - nextCrop.left - nextCrop.right) / 100,
        remainingY = (100 - nextCrop.top - nextCrop.bottom) / 100;
      setPrintResult(sourceResult);
      setPrintSize({ width: imageW, height: imageH });
      setCrop(nextCrop);
      setWidthCm(photoWidth);
      setHeightCm(photoHeight);
      cropBaseSize.current = {
        width: photoWidth / Math.max(0.01, remainingX),
        height: photoHeight / Math.max(0.01, remainingY),
      };
      setPosition({ x: A6.width / 2, y: A6.height / 2 });
      setRotation(0);
      setCropOpen(true);
      setStep(3);
      setSuccess(
        `Rosto alinhado pelos olhos em ${photoWidth} × ${photoHeight} cm.${Math.abs(eyeAngle) >= 2 ? ` Inclinação detectada: ${Math.abs(eyeAngle).toFixed(1)}°, mantida sem girar.` : ""}`,
      );
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setFraming(false);
    }
  };

  const exportTransparent = async () => {
    if (!result) return;
    try {
      const response = await fetch(result),
        blob = await response.blob();
      downloadBlob(blob, `${fileStem(file.name)}-sem-fundo.png`);
      setSuccess("PNG transparente baixado com sucesso.");
      onDone?.(file, blob.size);
    } catch (err) {
      setError(friendlyError(err));
    }
  };
  const createPrintCanvas = async () => {
    if (!layoutResult)
      throw new Error("Remova o fundo antes de preparar a impressão.");
    const dpi = 300,
      pxPerMm = dpi / 25.4,
      canvas = document.createElement("canvas");
    canvas.width = Math.round(A6.width * pxPerMm);
    canvas.height = Math.round(A6.height * pxPerMm);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const image = await loadImage(layoutResult),
      w = widthCm * 10 * pxPerMm,
      h = heightCm * 10 * pxPerMm;
    ctx.save();
    ctx.translate(position.x * pxPerMm, position.y * pxPerMm);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.translate(-w / 2, -h / 2);
    drawWithContour(
      ctx,
      image,
      w,
      h,
      contour,
      contourColor,
      contourWidth * pxPerMm,
    );
    ctx.restore();
    return canvas;
  };
  const exportPdf = async () => {
    try {
      const canvas = await createPrintCanvas(),
        { jsPDF } = await import("jspdf"),
        pdf = new jsPDF({
          orientation: "landscape",
          unit: "mm",
          format: [A6.width, A6.height],
          compress: true,
        });
      pdf.addImage(
        canvas.toDataURL("image/png"),
        "PNG",
        0,
        0,
        A6.width,
        A6.height,
        undefined,
        "NONE",
      );
      const blob = pdf.output("blob");
      downloadBlob(blob, `${fileStem(file.name)}-A6-paisagem.pdf`);
      setSuccess("PDF A6 paisagem gerado nas dimensões 148 × 105 mm.");
      onDone?.(file, blob.size);
    } catch (err) {
      setError(friendlyError(err));
    }
  };
  const print = () => {
    if (!result) {
      setError("Remova o fundo antes de imprimir.");
      return;
    }
    window.print();
  };

  const createPhotoSheetCanvas = async () => {
    if (!layoutResult)
      throw new Error(
        "Remova o fundo e ajuste a foto antes de montar a cartela.",
      );
    const dpi = 300,
      pxPerMm = dpi / 25.4,
      canvas = document.createElement("canvas");
    canvas.width = Math.round(A6.width * pxPerMm);
    canvas.height = Math.round(A6.height * pxPerMm);
    const ctx = canvas.getContext("2d"),
      image = await loadImage(layoutResult),
      itemW = photoWidth * 10,
      itemH = photoHeight * 10,
      gapX = Math.max(2, (A6.width - itemW * 4) / 5),
      gapY = Math.max(2, (A6.height - itemH * 2) / 3),
      startX = (A6.width - (itemW * 4 + gapX * 3)) / 2,
      startY = (A6.height - (itemH * 2 + gapY)) / 2;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let row = 0; row < 2; row += 1) {
      for (let column = 0; column < 4; column += 1) {
        const x = (startX + column * (itemW + gapX)) * pxPerMm,
          y = (startY + row * (itemH + gapY)) * pxPerMm,
          boxW = itemW * pxPerMm,
          boxH = itemH * pxPerMm,
          scale = Math.min(
            boxW / image.naturalWidth,
            boxH / image.naturalHeight,
          ),
          drawW = image.naturalWidth * scale,
          drawH = image.naturalHeight * scale,
          drawX = x + (boxW - drawW) / 2,
          drawY = y + (boxH - drawH) / 2;
        ctx.save();
        ctx.translate(drawX, drawY);
        drawWithContour(
          ctx,
          image,
          drawW,
          drawH,
          contour,
          contourColor,
          contourWidth * pxPerMm,
        );
        ctx.restore();
        if (!contour) {
          ctx.strokeStyle = "#c8c8c8";
          ctx.lineWidth = Math.max(1, 0.15 * pxPerMm);
          ctx.strokeRect(x, y, boxW, boxH);
        }
      }
    }
    return canvas;
  };

  const exportPhotoSheet = async () => {
    try {
      const canvas = await createPhotoSheetCanvas(),
        { jsPDF } = await import("jspdf"),
        pdf = new jsPDF({
          orientation: "landscape",
          unit: "mm",
          format: [A6.width, A6.height],
          compress: true,
        });
      pdf.addImage(
        canvas.toDataURL("image/png"),
        "PNG",
        0,
        0,
        A6.width,
        A6.height,
        undefined,
        "NONE",
      );
      const blob = pdf.output("blob");
      downloadBlob(blob, `${fileStem(file.name)}-cartela-8-fotos.pdf`);
      setSuccess("Cartela com 8 fotos gerada em A6 paisagem.");
      onDone?.(file, blob.size);
    } catch (err) {
      setError(friendlyError(err));
    }
  };

  const exportPhotoSheetJpeg = async () => {
    try {
      if (!window.plStudio?.encodePrintJpeg) {
        throw new Error(
          "A exportação JPG A6 está disponível no aplicativo instalado.",
        );
      }
      const canvas = await createPhotoSheetCanvas();
      const sourceBlob = await new Promise((resolve, reject) => {
        canvas.toBlob(
          (blob) =>
            blob
              ? resolve(blob)
              : reject(new Error("Não foi possível preparar a folha A6.")),
          "image/png",
        );
      });
      const encoded = await window.plStudio.encodePrintJpeg(
        await sourceBlob.arrayBuffer(),
        300,
      );
      const blob = new Blob([encoded], { type: "image/jpeg" });
      downloadBlob(
        blob,
        `${fileStem(file.name)}-cartela-8-fotos-A6-300dpi.jpg`,
        "image/jpeg",
      );
      setSuccess(
        "JPG A6 gerado em 148 × 105 mm, 1748 × 1240 px e 300 DPI.",
      );
      onDone?.(file, blob.size);
    } catch (err) {
      setError(friendlyError(err));
    }
  };

  const printPhotoSheet = async () => {
    try {
      const canvas = await createPhotoSheetCanvas();
      setSheetPrintData(canvas.toDataURL("image/png"));
      setTimeout(() => window.print(), 120);
    } catch (err) {
      setError(friendlyError(err));
    }
  };

  const contourShadow = contour
    ? `${contourColor} 0 0 ${Math.max(1, contourWidth * 1.8)}px, ${contourColor} 0 0 ${Math.max(2, contourWidth * 3)}px`
    : "none";
  return (
    <main
      className={`remove-bg-screen ${workflow === "photo" ? `photo-stage-${photoStage}` : "background-only-flow"}`}
    >
      <header className="utility-topbar">
        <button onClick={onClose}>
          <ArrowLeft /> Voltar
        </button>
        <div className="utility-brand">
          <span>PL</span>
          <strong>STUDIO</strong>
        </div>
        <span className="local-badge">
          <ShieldCheck /> 100% local · sem envio externo
        </span>
      </header>
      <section className="remove-bg-heading">
        <span>
          <Sparkles /> REMOÇÃO E IMPRESSÃO
        </span>
        <h1>
          Remover fundo e <em>preparar para impressão.</em>
        </h1>
        <p>Da foto do WhatsApp à página A6 paisagem, sem sair do PL Studio.</p>
        <div className="remove-steps">
          {(workflow === "photo"
            ? [
                "Escolher foto",
                "Ajustar pessoa",
                "Conferir cartela",
                "Imprimir",
              ]
            : ["Carregar imagem", "Remover fundo", "Baixar PNG"]
          ).map((label, index, labels) => (
            <React.Fragment key={label}>
              <span
                className={
                  (workflow === "photo" ? photoStage : step) >= index + 1
                    ? "active"
                    : ""
                }
              >
                <b>{index + 1}</b> {label}
              </span>
              {index < labels.length - 1 && <i>→</i>}
            </React.Fragment>
          ))}
        </div>
        <div className="remove-mode-picker">
          <button
            className={workflow === "background" ? "active" : ""}
            onClick={() => {
              setWorkflow("background");
              setPhotoStage(1);
            }}
          >
            <span>
              <Eraser />
            </span>
            <strong>Só remover fundo</strong>
            <small>Corrigir e baixar o PNG transparente</small>
          </button>
          <button
            className={workflow === "photo" ? "active" : ""}
            onClick={() => {
              setWorkflow("photo");
              setPhotoStage(1);
            }}
          >
            <span>
              <Crop />
            </span>
            <strong>Foto para alicate</strong>
            <small>3,2 × 4 cm · cartela com 8 fotos</small>
          </button>
        </div>
      </section>
      <section className="remove-print-workspace">
        <aside className="remove-bg-controls">
          <div className="photo-upload-step">
            <div className="step-title">
              <i>1</i>
              <div>
                <strong>Carregar imagem</strong>
                <small>JPG, JPEG, PNG ou JFIF · até 100 MB</small>
              </div>
            </div>
            <input
              ref={input}
              hidden
              type="file"
              accept=".jpg,.jpeg,.png,.jfif,image/jpeg,image/png"
              onChange={(event) => choose(event.target.files)}
            />
            {!file ? (
              <button
                className={`remove-upload ${dragging ? "dragging" : ""}`}
                onClick={() => input.current.click()}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragging(false);
                  choose(event.dataTransfer.files);
                }}
              >
                <UploadCloud />
                <strong>Selecionar ou arrastar imagem</strong>
                <small>Fotos recebidas pelo WhatsApp são aceitas</small>
              </button>
            ) : (
              <div className="remove-file">
                <img src={original} />
                <span>
                  <strong>{file.name}</strong>
                  <small>
                    {Math.round(file.size / 1024)} KB
                    {imageSize
                      ? ` · ${imageSize.width} × ${imageSize.height} px`
                      : ""}
                  </small>
                </span>
                <button
                  onClick={() => {
                    setFile(null);
                    setResult("");
                    setPrintResult("");
                    setOriginal("");
                    setNormalizedOriginal("");
                    setComparisonData(null);
                    undoStack.current = [];
                    redoStack.current = [];
                    setHistoryVersion((value) => value + 1);
                    setStep(1);
                  }}
                >
                  <X />
                </button>
              </div>
            )}
            <button
              className="remove-action main-a6-action"
              disabled={busy}
              onClick={() => remove(workflow === "photo")}
            >
              {busy ? (
                <>
                  <LoaderCircle className="spin" /> Processando {progress}%
                </>
              ) : (
                <>
                  <Sparkles />
                  {workflow === "photo"
                    ? "Remover fundo e preparar foto"
                    : "Remover fundo"}
                </>
              )}
            </button>
            {workflow === "photo" && (
              <button
                className="secondary-remove"
                disabled={busy || !file}
                onClick={() => remove(false)}
              >
                Somente remover fundo
              </button>
            )}
            {busy && (
              <div className="model-progress">
                <span>
                  <i style={{ width: `${progress}%` }} />
                </span>
                <small>
                  O modelo local está separando o objeto sem recriar a imagem.
                </small>
              </div>
            )}
            {error && <p className="remove-error">{error}</p>}
            {success && (
              <p className="remove-success">
                <Check /> {success}
              </p>
            )}
          </div>
          <div className="photo-correction-step">
            <details className="refinement-settings">
              <summary>Acabamento da remoção</summary>
              <label>
                <input
                  type="checkbox"
                  checked={edgeRefine}
                  onChange={(event) => setEdgeRefine(event.target.checked)}
                />
                Refinar somente bordas incertas
              </label>
              {workflow === "photo" && (
                <label>
                  <input
                    type="checkbox"
                    checked={portraitCleanup}
                    onChange={(event) =>
                      setPortraitCleanup(event.target.checked)
                    }
                  />
                  Limpar fundo preso ao contorno
                </label>
              )}
              <label>
                Limpeza de resíduos
                <select
                  value={cleanup}
                  onChange={(event) => setCleanup(event.target.value)}
                >
                  <option value="off">Desativada</option>
                  <option value="conservative">Conservadora</option>
                  <option value="strong">Mais forte</option>
                </select>
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={decontaminate}
                  onChange={(event) => setDecontaminate(event.target.checked)}
                />
                Reduzir halo de cor nas bordas
              </label>
              <small>
                As opções são aplicadas no próximo processamento. Detalhes
                duvidosos são preservados para correção manual.
              </small>
            </details>
            <div className="step-title option-step">
              <i>2</i>
              <div>
                <strong>Corrigir recorte</strong>
                <small>Apague resíduos ou restaure detalhes</small>
              </div>
            </div>
            <div className="mask-tools">
              <div>
                <button
                  className={editMode === "erase" ? "active" : ""}
                  onClick={() => setEditMode("erase")}
                >
                  <Eraser /> Apagar
                </button>
                <button
                  className={editMode === "restore" ? "active" : ""}
                  onClick={() => setEditMode("restore")}
                >
                  <Paintbrush /> Restaurar
                </button>
              </div>
              <label>
                Tamanho do pincel{" "}
                <input
                  type="range"
                  min="4"
                  max="180"
                  value={brushSize}
                  onChange={(event) => setBrushSize(Number(event.target.value))}
                />
                <b>{brushSize}px</b>
              </label>
              <div>
                <button
                  disabled={!undoStack.current.length || !historyVersion}
                  onClick={() => applyHistory(undoStack, redoStack)}
                >
                  <Undo2 /> Desfazer
                </button>
                <button
                  disabled={!redoStack.current.length || !historyVersion}
                  onClick={() => applyHistory(redoStack, undoStack)}
                >
                  <Redo2 /> Refazer
                </button>
              </div>
              <details className="manual-advanced">
                <summary>Ajustes avançados do pincel</summary>
                <div className="manual-advanced-body">
                  <label>
                    Dureza{" "}
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={brushHardness}
                      onChange={(event) =>
                        setBrushHardness(Number(event.target.value))
                      }
                    />
                    <b>{brushHardness}%</b>
                  </label>
                  <label>
                    Intensidade{" "}
                    <input
                      type="range"
                      min="5"
                      max="100"
                      value={brushIntensity}
                      onChange={(event) =>
                        setBrushIntensity(Number(event.target.value))
                      }
                    />
                    <b>{brushIntensity}%</b>
                  </label>
                  <div>
                    <button
                      onClick={() =>
                        setZoom((value) => clamp(value - 0.25, 0.5, 4))
                      }
                    >
                      <ZoomOut />
                    </button>
                    <span>{Math.round(zoom * 100)}%</span>
                    <button
                      onClick={() =>
                        setZoom((value) => clamp(value + 0.25, 0.5, 4))
                      }
                    >
                      <ZoomIn />
                    </button>
                    <button onClick={() => setCompare((value) => !value)}>
                      {compare ? "Ocultar original" : "Comparar"}
                    </button>
                  </div>
                  <label className="overlay-option">
                    <input
                      type="checkbox"
                      checked={overlayOriginal}
                      onChange={(event) =>
                        setOverlayOriginal(event.target.checked)
                      }
                    />
                    Sobrepor original
                    <input
                      type="range"
                      min="5"
                      max="80"
                      disabled={!overlayOriginal}
                      value={overlayOpacity}
                      onChange={(event) =>
                        setOverlayOpacity(Number(event.target.value))
                      }
                    />
                  </label>
                  <div className="preview-backgrounds">
                    {["checker", "white", "black"].map((background) => (
                      <button
                        className={
                          previewBackground === background ? "active" : ""
                        }
                        key={background}
                        onClick={() => setPreviewBackground(background)}
                      >
                        {background === "checker"
                          ? "Quadriculado"
                          : background === "white"
                            ? "Branco"
                            : "Preto"}
                      </button>
                    ))}
                  </div>
                </div>
              </details>
            </div>
            <div className="transparent-download">
              <button disabled={!result} onClick={exportTransparent}>
                <Download /> Baixar PNG transparente
              </button>
            </div>
          </div>
        </aside>
        <div className="remove-main-area">
          <section className="mask-editor-card">
            <header>
              <div>
                <i>2</i>
                <span>
                  <strong>Original e resultado transparente</strong>
                  <small>Use o pincel diretamente sobre o resultado</small>
                </span>
              </div>
              {result && (
                <span className="ready-badge">
                  <Check /> Pronto para ajustar
                </span>
              )}
            </header>
            <div className={`mask-compare ${compare ? "with-original" : ""}`}>
              {compare && (
                <figure>
                  <figcaption>Original</figcaption>
                  <div className="mask-preview-viewport">
                    {original ? (
                      <img
                        src={
                          workflow === "photo" && normalizedOriginal
                            ? normalizedOriginal
                            : original
                        }
                        alt="Imagem original para comparação"
                      />
                    ) : (
                      <EmptyPreview />
                    )}
                  </div>
                </figure>
              )}
              <figure>
                <figcaption>
                  Resultado ·{" "}
                  {editMode === "erase" ? "apagando" : "restaurando"}
                </figcaption>
                <div
                  className={`editor-scroll mask-preview-viewport preview-${previewBackground}`}
                >
                  {result ? (
                    <div
                      className="mask-edit-stage"
                      style={{
                        width: `${zoom * 100}%`,
                        height: `${zoom * 100}%`,
                      }}
                    >
                      <canvas
                        ref={editCanvas}
                        onPointerDown={beginPaint}
                        onPointerMove={paintAt}
                        onPointerUp={finishPaint}
                        onPointerCancel={finishPaint}
                      />
                      {overlayOriginal && normalizedOriginal && (
                        <img
                          className="original-overlay"
                          src={normalizedOriginal}
                          alt="Original sobreposta"
                          style={{ opacity: overlayOpacity / 100 }}
                        />
                      )}
                    </div>
                  ) : (
                    <EmptyPreview result />
                  )}
                </div>
              </figure>
            </div>
            {comparisonData && (
              <details className="refinement-comparison">
                <summary>Comparação técnica da remoção</summary>
                <div className="comparison-toolbar">
                  <span>Fundo da prévia:</span>
                  {[
                    ["checker", "Quadriculado"],
                    ["white", "Branco"],
                    ["black", "Preto"],
                  ].map(([value, label]) => (
                    <button
                      className={comparisonBackground === value ? "active" : ""}
                      key={value}
                      onClick={() => setComparisonBackground(value)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="comparison-grid">
                  {[
                    ["raw", "1. Resultado bruto do modelo"],
                    ["legacy", "2. Tratamento antigo"],
                    ["refined", "3. Novo refinamento"],
                  ].map(([key, label]) => (
                    <figure key={key}>
                      <figcaption>{label}</figcaption>
                      <div className={`comparison-bg ${comparisonBackground}`}>
                        <img
                          src={comparisonData[key]}
                          style={{ width: `${zoom * 100}%` }}
                          alt={label}
                        />
                      </div>
                    </figure>
                  ))}
                </div>
                <div className="mask-comparison-grid">
                  <figure>
                    <figcaption>Máscara original do modelo</figcaption>
                    <img
                      src={comparisonData.originalMask}
                      alt="Máscara original"
                    />
                  </figure>
                  <figure>
                    <figcaption>Máscara refinada</figcaption>
                    <img
                      src={comparisonData.refinedMask}
                      alt="Máscara refinada"
                    />
                  </figure>
                </div>
                <small>
                  O resultado bruto e a máscara original permanecem intactos. O
                  refinamento trabalha sobre uma cópia e mantém alpha parcial.
                </small>
              </details>
            )}
          </section>
          {workflow === "photo" && (
            <section className="a6-builder">
              <header>
                <div>
                  <i>3</i>
                  <span>
                    <strong>Preparar impressão · A6 paisagem</strong>
                    <small>148 × 105 mm · fundo branco</small>
                  </span>
                </div>
                <button
                  disabled={!layoutResult}
                  onClick={() =>
                    fitToPage(layoutSize?.width, layoutSize?.height)
                  }
                >
                  <Maximize2 /> Ajustar à página
                </button>
              </header>
              <div className="a6-builder-grid">
                <div className="a6-page-wrap">
                  <div
                    className="a6-page"
                    onPointerMove={movePrint}
                    onPointerUp={endPrintDrag}
                    onPointerCancel={endPrintDrag}
                  >
                    {layoutResult && (
                      <div
                        className={`a6-crop-frame ${cropOpen ? "cropping" : ""}`}
                        onPointerDown={beginPrintDrag}
                        style={{
                          width: `${(widthCm / 14.8) * 100}%`,
                          height: `${(heightCm / 10.5) * 100}%`,
                          left: `${(position.x / A6.width) * 100}%`,
                          top: `${(position.y / A6.height) * 100}%`,
                          transform: `translate(-50%,-50%) rotate(${rotation}deg)`,
                        }}
                      >
                        <img
                          className="a6-object"
                          src={layoutResult}
                          draggable="false"
                          style={{ filter: contourShadow }}
                        />
                        {cropOpen &&
                          [
                            ["top", null, "top"],
                            ["bottom", null, "bottom"],
                            ["left", "left", null],
                            ["right", "right", null],
                            ["top-left", "left", "top"],
                            ["top-right", "right", "top"],
                            ["bottom-left", "left", "bottom"],
                            ["bottom-right", "right", "bottom"],
                          ].map(([handle, horizontal, vertical]) => (
                            <button
                              type="button"
                              aria-label={`Recortar pelo lado ${handle}`}
                              className={`crop-handle ${handle}`}
                              key={handle}
                              onPointerDown={(event) =>
                                beginCropDrag(event, horizontal, vertical)
                              }
                              onPointerMove={moveCropHandle}
                              onPointerUp={endCropDrag}
                              onPointerCancel={endCropDrag}
                            />
                          ))}
                      </div>
                    )}
                    <span
                      className="safe-margin"
                      style={{
                        inset: `${(margin / A6.height) * 100}% ${(margin / A6.width) * 100}%`,
                      }}
                    />
                    {!layoutResult && (
                      <span className="a6-empty">
                        <ImagePlus /> O resultado será centralizado aqui
                      </span>
                    )}
                  </div>
                  <small>
                    Arraste a imagem para mover · área tracejada = margem de
                    segurança
                  </small>
                </div>
                <div className="a6-options">
                  <label
                    className={showPrintAdvanced ? "" : "advanced-print-hidden"}
                  >
                    Margem de segurança{" "}
                    <span>
                      <input
                        type="number"
                        min="0"
                        max="20"
                        step="0.5"
                        value={margin}
                        onChange={(event) => updateMargin(event.target.value)}
                      />{" "}
                      mm
                    </span>
                  </label>
                  <div className="dimension-row">
                    <label>
                      Largura{" "}
                      <span>
                        <input
                          type="number"
                          min="0.1"
                          max="30"
                          step="0.1"
                          value={widthCm}
                          onChange={(event) => updateWidth(event.target.value)}
                        />{" "}
                        cm
                      </span>
                    </label>
                    <label>
                      Altura{" "}
                      <span>
                        <input
                          type="number"
                          min="0.1"
                          max="30"
                          step="0.1"
                          value={heightCm}
                          onChange={(event) => updateHeight(event.target.value)}
                        />{" "}
                        cm
                      </span>
                    </label>
                  </div>
                  <button
                    className="auto-face-button"
                    disabled={!result || framing}
                    onClick={() => autoFrameFace()}
                  >
                    {framing ? (
                      <>
                        <LoaderCircle className="spin" /> Localizando rosto...
                      </>
                    ) : (
                      <>
                        <ScanFace /> Enquadrar rosto automaticamente
                      </>
                    )}
                  </button>
                  <button
                    className={`crop-toggle ${cropOpen ? "active" : ""}`}
                    disabled={!printResult}
                    onClick={() => setCropOpen((value) => !value)}
                  >
                    <Crop /> {cropOpen ? "Fechar recorte" : "Recortar imagem"}
                  </button>
                  {cropOpen && (
                    <div className="crop-panel">
                      <header>
                        <strong>Ajuste o enquadramento</strong>
                        <button onClick={resetCrop}>Restaurar</button>
                      </header>
                      {[
                        ["top", "Topo"],
                        ["bottom", "Base"],
                        ["left", "Esquerda"],
                        ["right", "Direita"],
                      ].map(([side, label]) => (
                        <label key={side}>
                          <span>{label}</span>
                          <input
                            type="range"
                            min="0"
                            max="80"
                            step="0.5"
                            value={crop[side]}
                            onChange={(event) =>
                              updateCrop(side, event.target.value)
                            }
                          />
                          <b>{crop[side]}%</b>
                        </label>
                      ))}
                      <small>
                        O recorte afeta somente a montagem A6. O PNG
                        transparente original permanece intacto.
                      </small>
                    </div>
                  )}
                  <button
                    className="print-advanced-toggle"
                    onClick={() => setShowPrintAdvanced((value) => !value)}
                  >
                    {showPrintAdvanced
                      ? "Ocultar ajustes avançados"
                      : "Ajustes avançados"}
                  </button>
                  <label
                    className={`check-option ${showPrintAdvanced ? "" : "advanced-print-hidden"}`}
                  >
                    <input
                      type="checkbox"
                      checked={lockRatio}
                      onChange={(event) => setLockRatio(event.target.checked)}
                    />{" "}
                    Manter proporção
                  </label>
                  <label
                    className={showPrintAdvanced ? "" : "advanced-print-hidden"}
                  >
                    Rotação{" "}
                    <span>
                      <input
                        type="range"
                        min="-180"
                        max="180"
                        step="1"
                        value={rotation}
                        onChange={(event) =>
                          setRotation(Number(event.target.value))
                        }
                      />
                      <b>{rotation}°</b>
                    </span>
                  </label>
                  <div
                    className={`nudge-row ${showPrintAdvanced ? "" : "advanced-print-hidden"}`}
                  >
                    <button
                      onClick={() =>
                        setPosition((value) => ({ ...value, x: value.x - 1 }))
                      }
                    >
                      ←
                    </button>
                    <button
                      onClick={() =>
                        setPosition((value) => ({ ...value, y: value.y - 1 }))
                      }
                    >
                      ↑
                    </button>
                    <button
                      onClick={() =>
                        setPosition((value) => ({ ...value, y: value.y + 1 }))
                      }
                    >
                      ↓
                    </button>
                    <button
                      onClick={() =>
                        setPosition((value) => ({ ...value, x: value.x + 1 }))
                      }
                    >
                      →
                    </button>
                    <small>Mover 1 mm</small>
                  </div>
                  <label
                    className={`check-option ${showPrintAdvanced ? "" : "advanced-print-hidden"}`}
                  >
                    <input
                      type="checkbox"
                      checked={contour}
                      onChange={(event) => setContour(event.target.checked)}
                    />{" "}
                    Contorno para recorte
                  </label>
                  {contour && (
                    <div
                      className={`contour-options ${showPrintAdvanced ? "" : "advanced-print-hidden"}`}
                    >
                      <label>
                        Cor{" "}
                        <input
                          type="color"
                          value={contourColor}
                          onChange={(event) =>
                            setContourColor(event.target.value)
                          }
                        />
                      </label>
                      <label>
                        Espessura{" "}
                        <span>
                          <input
                            type="number"
                            min="0.1"
                            max="3"
                            step="0.1"
                            value={contourWidth}
                            onChange={(event) =>
                              setContourWidth(
                                clamp(
                                  Number(event.target.value) || 0.1,
                                  0.1,
                                  3,
                                ),
                              )
                            }
                          />{" "}
                          mm
                        </span>
                      </label>
                    </div>
                  )}
                  <button
                    className={`fit-button ${showPrintAdvanced ? "" : "advanced-print-hidden"}`}
                    disabled={!layoutResult}
                    onClick={() =>
                      fitToPage(layoutSize?.width, layoutSize?.height)
                    }
                  >
                    <Maximize2 /> Ajustar à página
                  </button>
                </div>
              </div>
              <footer className="a6-actions">
                <button onClick={() => setPhotoStage(1)}>
                  <ArrowLeft /> Trocar foto
                </button>
                <button
                  className="print-button"
                  disabled={!layoutResult}
                  onClick={() => setPhotoStage(3)}
                >
                  <Check /> Foto pronta
                </button>
              </footer>
            </section>
          )}
          {workflow === "photo" && (
            <section className="photo-sheet-card">
              <header>
                <div>
                  <i>4</i>
                  <span>
                    <strong>
                      {photoStage === 4
                        ? "Pronto para imprimir"
                        : "Confira a cartela com 8 fotos"}
                    </strong>
                    <small>A6 paisagem · 4 colunas × 2 linhas</small>
                  </span>
                </div>
                <strong className="photo-price">8 fotos · R$ 8,00</strong>
              </header>
              <div className="photo-sheet-grid">
                <div className="photo-sheet-preview">
                  {Array.from({ length: 8 }, (_, index) => (
                    <div
                      className="photo-sheet-slot"
                      key={index}
                      style={{ aspectRatio: `${photoWidth}/${photoHeight}` }}
                    >
                      {layoutResult ? (
                        <img src={layoutResult} alt="" />
                      ) : (
                        <ImagePlus />
                      )}
                    </div>
                  ))}
                </div>
                <aside className="photo-sheet-options">
                  <strong>Tamanho de cada foto</strong>
                  <button
                    className="cutter-preset"
                    onClick={() => {
                      setPhotoWidth(CUTTER_PRESET.width);
                      setPhotoHeight(CUTTER_PRESET.height);
                    }}
                  >
                    Meu alicate · 3,2 × 4 cm
                  </button>
                  <div className="dimension-row">
                    <label>
                      Largura
                      <span>
                        <input
                          type="number"
                          min="1"
                          max="3.5"
                          step="0.1"
                          value={photoWidth}
                          onChange={(event) =>
                            setPhotoWidth(
                              clamp(Number(event.target.value) || 1, 1, 3.5),
                            )
                          }
                        />{" "}
                        cm
                      </span>
                    </label>
                    <label>
                      Altura
                      <span>
                        <input
                          type="number"
                          min="1"
                          max="4.8"
                          step="0.1"
                          value={photoHeight}
                          onChange={(event) =>
                            setPhotoHeight(
                              clamp(Number(event.target.value) || 1, 1, 4.8),
                            )
                          }
                        />{" "}
                        cm
                      </span>
                    </label>
                  </div>
                  <small>
                    A proporção da foto é preservada. Caso sobre espaço, ele
                    ficará branco para evitar distorção.
                  </small>
                  <div className="sheet-stage-actions">
                    <button onClick={() => setPhotoStage(2)}>
                      <ArrowLeft /> Ajustar foto
                    </button>
                    {photoStage === 3 ? (
                      <button
                        className="photo-sheet-export"
                        disabled={!layoutResult}
                        onClick={() => setPhotoStage(4)}
                      >
                        Continuar para impressão
                      </button>
                    ) : (
                      <>
                        <button
                          className="photo-sheet-export"
                          disabled={!layoutResult}
                          onClick={exportPhotoSheet}
                        >
                          <Download /> Baixar PDF
                        </button>
                        <button
                          className="photo-sheet-export photo-sheet-jpeg"
                          disabled={!layoutResult}
                          onClick={exportPhotoSheetJpeg}
                        >
                          <Download /> Baixar JPG A6
                        </button>
                        <button
                          className="photo-sheet-export print-sheet-button"
                          disabled={!layoutResult}
                          onClick={printPhotoSheet}
                        >
                          <Printer /> Imprimir
                        </button>
                      </>
                    )}
                  </div>
                </aside>
              </div>
            </section>
          )}
          {sheetPrintData && (
            <img
              className="photo-print-page"
              src={sheetPrintData}
              alt="Cartela pronta para impressão"
            />
          )}
        </div>
      </section>
      <footer className="remove-bg-footer">
        <ShieldCheck /> Remoção executada localmente. Nenhuma imagem ou chave de
        API é enviada a serviço externo.
      </footer>
    </main>
  );
}

function EmptyPreview({ result = false }) {
  return (
    <span className="empty-mask">
      <ImagePlus />
      <strong>
        {result ? "O resultado aparecerá aqui" : "Carregue uma imagem"}
      </strong>
      <small>
        {result ? "Remova o fundo para começar" : "JPG, JPEG, PNG ou JFIF"}
      </small>
    </span>
  );
}
