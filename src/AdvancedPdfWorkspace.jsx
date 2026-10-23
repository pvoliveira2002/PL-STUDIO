import React, { useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, Download, FileText, LoaderCircle, ShieldCheck, UploadCloud, X } from "lucide-react";
import * as pdfjs from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import {
  addPdfFormField,
  comparePageTexts,
  createPdfA2bFromJpegs,
  cropPdf,
  replacePageWithRaster,
  summarizeText,
} from "./features/pdf/advancedPdfTools";
import { preparePdfFiles } from "./pdfSecurity";
import { downloadFile, fileStem, formatBytes } from "./shared/files";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;

const defaults = {
  crop: { left: 0, right: 0, top: 0, bottom: 0 },
  forms: { name: "nome", defaultValue: "", page: 1, x: 10, y: 78, width: 80, height: 7 },
  redact: { page: 1, left: 20, top: 35, width: 60, height: 12, color: "#000000" },
  pdfa: { scale: 2 },
  summarize: { sentences: 7 },
};

const labels = {
  crop: { title: "Recortar PDF", action: "Aplicar recorte", suffix: "recortado" },
  forms: { title: "Formulários PDF", action: "Adicionar campo", suffix: "formulario" },
  redact: { title: "Ocultar conteúdo", action: "Remover conteúdo", suffix: "redigido" },
  compare: { title: "Comparar PDFs", action: "Comparar documentos" },
  pdfa: { title: "PDF para PDF/A-2b", action: "Gerar PDF/A", suffix: "PDF-A-2b" },
  summarize: { title: "Resumir PDF localmente", action: "Criar resumo" },
};

async function loadPdf(file) {
  return pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
}

async function pagePreview(file, requestedPage = 1) {
  const pdf = await loadPdf(file);
  const pageNumber = Math.max(1, Math.min(pdf.numPages, Number(requestedPage) || 1));
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale: 1.15 });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const context = canvas.getContext("2d", { alpha: false });
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: context, viewport }).promise;
  return { image: canvas.toDataURL("image/jpeg", 0.9), pages: pdf.numPages };
}

async function visualPageSignatures(file) {
  const pdf = await loadPdf(file);
  const signatures = [];
  for (let index = 1; index <= pdf.numPages; index += 1) {
    const page = await pdf.getPage(index);
    const viewport = page.getViewport({ scale: 0.22 });
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.ceil(viewport.width));
    canvas.height = Math.max(1, Math.ceil(viewport.height));
    const context = canvas.getContext("2d", { alpha: false, willReadFrequently: true });
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: context, viewport }).promise;
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const signature = new Uint8Array(canvas.width * canvas.height);
    for (let pixel = 0, target = 0; pixel < pixels.length; pixel += 4, target += 1) {
      signature[target] = Math.round((pixels[pixel] * 0.299) + (pixels[pixel + 1] * 0.587) + (pixels[pixel + 2] * 0.114));
    }
    signatures.push({ width: canvas.width, height: canvas.height, pixels: signature });
  }
  return signatures;
}

function visualSimilarity(left, right) {
  if (!left || !right || left.width !== right.width || left.height !== right.height) return 0;
  let difference = 0;
  for (let index = 0; index < left.pixels.length; index += 1) {
    difference += Math.abs(left.pixels[index] - right.pixels[index]);
  }
  return Math.max(0, Math.round(100 - (difference / (left.pixels.length * 255)) * 100));
}

async function extractTextPages(file) {
  const pdf = await loadPdf(file);
  const pages = [];
  for (let index = 1; index <= pdf.numPages; index += 1) {
    const page = await pdf.getPage(index);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => item.str).join(" "));
  }
  return pages;
}

async function renderJpegPages(file, scale, onProgress) {
  const pdf = await loadPdf(file);
  const pages = [];
  for (let index = 1; index <= pdf.numPages; index += 1) {
    const page = await pdf.getPage(index);
    const size = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext("2d", { alpha: false });
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: context, viewport }).promise;
    const blob = await new Promise((resolve, reject) =>
      canvas.toBlob(
        (value) => value ? resolve(value) : reject(new Error("Falha ao rasterizar uma página.")),
        "image/jpeg",
        0.94,
      ),
    );
    pages.push({ bytes: await blob.arrayBuffer(), width: size.width, height: size.height });
    onProgress?.(Math.round((index / pdf.numPages) * 85));
  }
  return pages;
}

async function redactPdf(file, config, onProgress) {
  const sourceBytes = await file.arrayBuffer();
  const rendered = await loadPdf(file);
  const target = Math.max(0, Math.min(rendered.numPages - 1, Number(config.page || 1) - 1));
  const page = await rendered.getPage(target + 1);
  const size = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: 2.4 });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const context = canvas.getContext("2d", { alpha: false });
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: context, viewport }).promise;
  onProgress?.(55);
  context.fillStyle = config.color || "#000000";
  context.fillRect(
    (canvas.width * Number(config.left)) / 100,
    (canvas.height * Number(config.top)) / 100,
    (canvas.width * Number(config.width)) / 100,
    (canvas.height * Number(config.height)) / 100,
  );
  const blob = await new Promise((resolve, reject) =>
    canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Falha ao proteger a página.")), "image/jpeg", 0.96),
  );
  onProgress?.(85);
  return replacePageWithRaster(sourceBytes, target, await blob.arrayBuffer(), size);
}

export default function AdvancedPdfWorkspace({ tool, initialFiles = [], onClose, onDone }) {
  const input = useRef(null);
  const cropDrag = useRef(null);
  const [files, setFiles] = useState(initialFiles);
  const [config, setConfig] = useState(defaults[tool.id] || {});
  const [preview, setPreview] = useState("");
  const [pageCount, setPageCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const definition = labels[tool.id];
  const needsTwo = tool.id === "compare";

  useEffect(() => {
    let alive = true;
    if (!files[0]) {
      setPreview("");
      setPageCount(0);
      return undefined;
    }
    const requestedPage = ["forms", "redact"].includes(tool.id) ? config.page : 1;
    pagePreview(files[0], requestedPage)
      .then((value) => {
        if (alive) {
          setPreview(value.image);
          setPageCount(value.pages);
        }
      })
      .catch((reason) => alive && setError(reason.message));
    return () => { alive = false; };
  }, [files, config.page, tool.id]);

  const choose = async (list) => {
    try {
      const incoming = await preparePdfFiles(list);
      setFiles(needsTwo ? incoming.slice(0, 2) : incoming.slice(0, 1));
      setError("");
      setResult(null);
    } catch (reason) {
      setError(reason.message || "Não foi possível abrir o PDF.");
    }
  };

  const update = (key, value) => {
    setConfig((current) => ({ ...current, [key]: value }));
    if (tool.id === "crop") setResult(null);
  };

  const startCropDrag = (event, mode) => {
    if (tool.id !== "crop") return;
    event.preventDefault();
    event.stopPropagation();
    const paper = event.currentTarget.closest(".advanced-preview-paper");
    if (!paper) return;
    const rect = paper.getBoundingClientRect();
    cropDrag.current = {
      mode,
      startX: event.clientX,
      startY: event.clientY,
      width: rect.width,
      height: rect.height,
      crop: {
        left: Number(config.left) || 0,
        right: Number(config.right) || 0,
        top: Number(config.top) || 0,
        bottom: Number(config.bottom) || 0,
      },
    };
    document.body.classList.add("is-cropping-pdf");
  };

  useEffect(() => {
    const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
    const move = (event) => {
      const drag = cropDrag.current;
      if (!drag) return;
      event.preventDefault();
      const dx = ((event.clientX - drag.startX) / Math.max(1, drag.width)) * 100;
      const dy = ((event.clientY - drag.startY) / Math.max(1, drag.height)) * 100;
      const start = drag.crop;
      let { left, right, top, bottom } = start;
      if (drag.mode === "move") {
        const horizontal = clamp(dx, -start.left, start.right);
        const vertical = clamp(dy, -start.top, start.bottom);
        left = start.left + horizontal;
        right = start.right - horizontal;
        top = start.top + vertical;
        bottom = start.bottom - vertical;
      } else {
        if (drag.mode.includes("w")) left = clamp(start.left + dx, 0, 95 - start.right);
        if (drag.mode.includes("e")) right = clamp(start.right - dx, 0, 95 - start.left);
        if (drag.mode.includes("n")) top = clamp(start.top + dy, 0, 95 - start.bottom);
        if (drag.mode.includes("s")) bottom = clamp(start.bottom - dy, 0, 95 - start.top);
      }
      const precise = (value) => Math.round(value * 10) / 10;
      setConfig((current) => ({ ...current, left: precise(left), right: precise(right), top: precise(top), bottom: precise(bottom) }));
      setResult(null);
    };
    const stop = () => {
      if (!cropDrag.current) return;
      cropDrag.current = null;
      document.body.classList.remove("is-cropping-pdf");
    };
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
      document.body.classList.remove("is-cropping-pdf");
    };
  }, []);

  const process = async () => {
    if (!files.length || (needsTwo && files.length !== 2)) {
      setError(needsTwo ? "Selecione exatamente dois PDFs." : "Selecione um PDF.");
      return;
    }
    setBusy(true);
    setProgress(5);
    setError("");
    setResult(null);
    try {
      if (tool.id === "compare") {
        const [left, right, leftVisual, rightVisual] = await Promise.all([
          extractTextPages(files[0]),
          extractTextPages(files[1]),
          visualPageSignatures(files[0]),
          visualPageSignatures(files[1]),
        ]);
        const rows = comparePageTexts(left, right).map((row, index) => {
          if (!leftVisual[index] || !rightVisual[index]) return row;
          const visual = visualSimilarity(leftVisual[index], rightVisual[index]);
          const hasText = Boolean(left[index]?.trim() || right[index]?.trim());
          const similarity = hasText ? Math.round((row.similarity + visual) / 2) : visual;
          return { ...row, visualSimilarity: visual, similarity, status: similarity >= 99 ? "igual" : "alterada" };
        });
        const changed = rows.filter((row) => row.status !== "igual").length;
        setResult({ kind: "compare", rows, changed });
        onDone?.(tool, files, 0);
      } else if (tool.id === "summarize") {
        const pages = await extractTextPages(files[0]);
        const summary = summarizeText(pages.join(" "), Number(config.sentences));
        const blob = new Blob([summary], { type: "text/plain;charset=utf-8" });
        downloadFile(blob, `${fileStem(files[0].name)}-resumo-local.txt`, blob.type);
        setResult({ kind: "summary", summary });
        onDone?.(tool, files, blob.size);
      } else {
        let bytes;
        if (tool.id === "crop") {
          bytes = await cropPdf(await files[0].arrayBuffer(), config);
          const stagedFile = new File([bytes], files[0].name, { type: "application/pdf", lastModified: Date.now() });
          setFiles([stagedFile]);
          setConfig(defaults.crop);
          setResult({ kind: "crop-ready", bytes, size: bytes.length });
        }
        if (tool.id === "forms") bytes = await addPdfFormField(await files[0].arrayBuffer(), config);
        if (tool.id === "redact") bytes = await redactPdf(files[0], config, setProgress);
        if (tool.id === "pdfa") {
          if (!window.plStudio?.getSrgbProfile) throw new Error("O perfil sRGB do Windows não está disponível.");
          const pages = await renderJpegPages(files[0], Number(config.scale), setProgress);
          const profile = await window.plStudio.getSrgbProfile();
          bytes = await createPdfA2bFromJpegs(pages, profile, fileStem(files[0].name));
        }
        if (tool.id !== "crop") {
          downloadFile(bytes, `${fileStem(files[0].name)}-${definition.suffix}.pdf`);
          setResult({ kind: "file", size: bytes.length });
          onDone?.(tool, files, bytes.length);
        }
      }
      setProgress(100);
    } catch (reason) {
      setError(reason.message || "Não foi possível processar o PDF.");
    } finally {
      setBusy(false);
    }
  };

  const downloadCrop = () => {
    if (result?.kind !== "crop-ready") return;
    downloadFile(result.bytes, `${fileStem(files[0]?.name)}-${definition.suffix}.pdf`);
    onDone?.(tool, files, result.size);
    setResult((current) => ({ ...current, downloaded: true }));
  };

  const overlay = tool.id === "crop"
    ? { left: `${config.left}%`, top: `${config.top}%`, right: `${config.right}%`, bottom: `${config.bottom}%` }
    : tool.id === "forms"
      ? { left: `${config.x}%`, top: `${config.y}%`, width: `${config.width}%`, height: `${config.height}%` }
      : tool.id === "redact"
        ? { left: `${config.left}%`, top: `${config.top}%`, width: `${config.width}%`, height: `${config.height}%`, background: config.color }
        : null;

  return <div className="advanced-pdf-screen">
    <header><button onClick={onClose}><ArrowLeft/> Voltar</button><div><strong>{definition.title}</strong><small>Processamento local e privado</small></div><span><ShieldCheck/> Local</span></header>
    <main className={tool.id === "crop" ? "advanced-crop-layout" : ""}>
      <section className="advanced-pdf-inputs">
        <span className="section-tag">FERRAMENTA PDF</span><h1>{definition.title}</h1>
        <input ref={input} hidden type="file" accept=".pdf" multiple={needsTwo} onChange={(event) => choose(event.target.files)}/>
        <button className="advanced-file-picker" onClick={() => input.current?.click()}><UploadCloud/><span><strong>{files.length ? needsTwo ? "Trocar os dois PDFs" : "Trocar PDF" : needsTwo ? "Selecionar dois PDFs" : "Selecionar PDF"}</strong><small>PDF · até 100 MB por arquivo</small></span></button>
        {files.map((file) => <div className="advanced-file-row" key={file.name}><FileText/><span><strong>{file.name}</strong><small>{formatBytes(file.size)}</small></span><button onClick={() => setFiles((current) => current.filter((item) => item !== file))}><X/></button></div>)}

        {tool.id === "crop" && <><p className="advanced-crop-hint">Arraste as bordas ou os cantos na pré-visualização. Arraste o centro para reposicionar a área.</p><ControlGrid config={config} update={update} fields={[["left","Esquerda (%)"],["right","Direita (%)"],["top","Topo (%)"],["bottom","Base (%)"]]}/><button type="button" className="advanced-crop-reset" onClick={() => { setConfig({ left: 0, right: 0, top: 0, bottom: 0 }); setResult(null); }}>Restaurar página inteira</button></>} 
        {tool.id === "forms" && <><label className="advanced-field"><span>Nome do campo</span><input value={config.name} onChange={(event) => update("name", event.target.value)}/></label><label className="advanced-field"><span>Texto inicial</span><input value={config.defaultValue} onChange={(event) => update("defaultValue", event.target.value)}/></label><ControlGrid config={config} update={update} fields={[["page","Página"],["x","Esquerda (%)"],["y","Topo (%)"],["width","Largura (%)"],["height","Altura (%)"]]}/></>}
        {tool.id === "redact" && <><ControlGrid config={config} update={update} fields={[["page","Página"],["left","Esquerda (%)"],["top","Topo (%)"],["width","Largura (%)"],["height","Altura (%)"]]}/><label className="advanced-field"><span>Cor da cobertura</span><input type="color" value={config.color} onChange={(event) => update("color", event.target.value)}/></label><p className="advanced-warning">A página escolhida será rasterizada. O conteúdo coberto não permanecerá escondido no arquivo.</p></>}
        {tool.id === "pdfa" && <><label className="advanced-field"><span>Qualidade de preservação</span><select value={config.scale} onChange={(event) => update("scale", event.target.value)}><option value="1.5">Boa · arquivo menor</option><option value="2">Alta · recomendada</option><option value="2.5">Máxima · arquivo maior</option></select></label><p className="advanced-warning">O PDF/A-2b é rasterizado para eliminar recursos incompatíveis. O texto deixa de ser selecionável.</p></>}
        {tool.id === "summarize" && <label className="advanced-field"><span>Tamanho do resumo</span><select value={config.sentences} onChange={(event) => update("sentences", event.target.value)}><option value="5">Curto · 5 trechos</option><option value="7">Médio · 7 trechos</option><option value="10">Detalhado · 10 trechos</option></select><small>Resumo extrativo: preserva frases do próprio documento e não inventa conteúdo.</small></label>}
        {tool.id === "compare" && <p className="advanced-hint">O PL Studio compara texto e aparência de cada página, inclusive em documentos escaneados.</p>}

        {error && <div className="advanced-error">{error}</div>}
        <button className="advanced-process" disabled={busy} onClick={process}>{busy ? <><LoaderCircle className="spin"/> Processando {progress}%</> : <>{tool.id === "crop" ? "Aplicar na pré-visualização" : definition.action}<Check/></>}</button>
      </section>
      <section className="advanced-pdf-preview">
        <header><div><strong>Pré-visualização</strong><small>{pageCount ? `${pageCount} página${pageCount === 1 ? "" : "s"}` : "Selecione um documento"}</small></div></header>
        <div className="advanced-preview-stage">{preview ? <div className="advanced-preview-paper"><img src={preview} alt="Primeira página do PDF"/>{tool.id === "crop" ? <span className="advanced-overlay crop manual-crop" style={overlay} onPointerDown={(event) => startCropDrag(event, "move")}><i className="crop-edge north" onPointerDown={(event) => startCropDrag(event, "n")}/><i className="crop-edge east" onPointerDown={(event) => startCropDrag(event, "e")}/><i className="crop-edge south" onPointerDown={(event) => startCropDrag(event, "s")}/><i className="crop-edge west" onPointerDown={(event) => startCropDrag(event, "w")}/><i className="crop-handle nw" onPointerDown={(event) => startCropDrag(event, "nw")}/><i className="crop-handle ne" onPointerDown={(event) => startCropDrag(event, "ne")}/><i className="crop-handle se" onPointerDown={(event) => startCropDrag(event, "se")}/><i className="crop-handle sw" onPointerDown={(event) => startCropDrag(event, "sw")}/><b>Arraste para ajustar</b></span> : overlay && <span className={`advanced-overlay ${tool.id}`} style={overlay}/>}</div> : <div className="advanced-preview-empty"><FileText/><strong>O documento aparecerá aqui</strong></div>}</div>
        {result?.kind === "file" && <div className="advanced-success"><Check/> Arquivo gerado e baixado · {formatBytes(result.size)}</div>}
        {result?.kind === "crop-ready" && <div className="advanced-crop-ready"><span><Check/><span><strong>{result.downloaded ? "PDF baixado com sucesso" : "Prévia atualizada"}</strong><small>{result.downloaded ? "O resultado continua disponível para outra cópia." : `Confira o resultado antes de baixar · ${formatBytes(result.size)}`}</small></span></span><button type="button" className={result.downloaded ? "downloaded" : ""} onClick={downloadCrop}><Download/>{result.downloaded ? "Baixar outra cópia" : "Baixar PDF recortado"}</button></div>}
        {result?.kind === "compare" && <div className="advanced-result"><strong>{result.changed ? `${result.changed} página(s) com diferenças` : "Os documentos possuem o mesmo texto"}</strong><div>{result.rows.map((row) => <span key={row.page} className={row.status}><b>Página {row.page}</b>{row.status} · {row.similarity}% semelhante</span>)}</div></div>}
        {result?.kind === "summary" && <div className="advanced-summary"><strong>Resumo gerado</strong><p>{result.summary}</p><small><Download/> Uma cópia em TXT foi baixada.</small></div>}
      </section>
    </main>
  </div>;
}

function ControlGrid({ config, update, fields }) {
  return <div className="advanced-control-grid">{fields.map(([key, label]) => <label key={key}><span>{label}</span><input type="number" min="0" max={key === "page" ? 9999 : 95} step="1" value={config[key]} onChange={(event) => update(key, event.target.value)}/></label>)}</div>;
}
