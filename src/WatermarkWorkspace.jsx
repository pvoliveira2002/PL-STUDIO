import React, { useEffect, useRef, useState } from "react";
import { ArrowLeft, Bold, Check, Download, FileImage, FileText, Image, Italic, Layers, LoaderCircle, ShieldCheck, Type, Underline, UploadCloud, X } from "lucide-react";
import * as pdfjs from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { preparePdfFiles } from "./pdfSecurity";
import { addWatermark } from "./features/pdf/watermark";
import { downloadFile, fileStem, formatBytes } from "./shared/files";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;
const positions = ["top-left", "top-center", "top-right", "center-left", "center-center", "center-right", "bottom-left", "bottom-center", "bottom-right"];

async function renderPdf(file) {
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: 1.35 });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
  const context = canvas.getContext("2d", { alpha: false });
  context.fillStyle = "#fff"; context.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: context, viewport }).promise;
  return { image: canvas.toDataURL("image/jpeg", .92), total: pdf.numPages };
}

export default function WatermarkWorkspace({ tool, initialFile, onClose, onDone }) {
  const pdfInput = useRef(null); const imageInput = useRef(null);
  const [file, setFile] = useState(initialFile || null); const [preview, setPreview] = useState(""); const [total, setTotal] = useState(0);
  const [kind, setKind] = useState("text"); const [text, setText] = useState("PL Studio"); const [markImage, setMarkImage] = useState(null); const [imageUrl, setImageUrl] = useState("");
  const [position, setPosition] = useState("center-center"); const [mosaic, setMosaic] = useState(false); const [transparency, setTransparency] = useState(65); const [rotation, setRotation] = useState(-30);
  const [fromPage, setFromPage] = useState(1); const [toPage, setToPage] = useState(1); const [layer, setLayer] = useState("above");
  const [fontFamily, setFontFamily] = useState("helvetica"); const [fontSize, setFontSize] = useState(42); const [bold, setBold] = useState(false); const [italic, setItalic] = useState(false); const [underline, setUnderline] = useState(false); const [color, setColor] = useState("#30343b"); const [imageScale, setImageScale] = useState(28);
  const [loading, setLoading] = useState(false); const [processing, setProcessing] = useState(false); const [error, setError] = useState(""); const [success, setSuccess] = useState("");

  useEffect(() => {
    if (!file) { setPreview(""); setTotal(0); return; }
    let active = true; setLoading(true); setError("");
    renderPdf(file).then((result) => { if (active) { setPreview(result.image); setTotal(result.total); setToPage(result.total); } }).catch((reason) => active && setError(reason.message || String(reason))).finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [file]);

  useEffect(() => () => { if (imageUrl) URL.revokeObjectURL(imageUrl); }, [imageUrl]);

  async function choosePdf(list) {
    try { const selected = Array.from(list || []).filter((item) => item.name.toLowerCase().endsWith(".pdf")); if (!selected.length) return; const [prepared] = await preparePdfFiles(selected.slice(0, 1)); setFile(prepared); setSuccess(""); }
    catch (reason) { setError(reason.message || String(reason)); }
  }
  function chooseImage(list) {
    const selected = Array.from(list || [])[0]; if (!selected) return;
    if (!/\.(png|jpe?g|jfif)$/i.test(selected.name)) { setError("Use uma imagem PNG, JPG, JPEG ou JFIF."); return; }
    if (imageUrl) URL.revokeObjectURL(imageUrl); setMarkImage(selected); setImageUrl(URL.createObjectURL(selected)); setError("");
  }
  async function processPdf() {
    if (!file || processing || (kind === "image" && !markImage)) return;
    setProcessing(true); setError(""); setSuccess("");
    try {
      const result = await addWatermark(new Uint8Array(await file.arrayBuffer()), { kind, text, imageBytes: markImage ? new Uint8Array(await markImage.arrayBuffer()) : null, imageType: markImage?.type || markImage?.name, imageScale: imageScale / 100, position, mosaic, opacity: 1 - transparency / 100, rotation, fromPage, toPage, layer, fontFamily, fontSize, bold, italic, underline, color });
      const outputName = `${fileStem(file.name)}-marca-dagua.pdf`; downloadFile(result, outputName); setSuccess(`${outputName} foi gerado.`); onDone?.(tool, [file], result.length);
    } catch (reason) { setError(`Não foi possível aplicar a marca d'água: ${reason.message || reason}`); }
    finally { setProcessing(false); }
  }
  const font = fontFamily === "times" ? "Georgia,serif" : fontFamily === "courier" ? "Courier New,monospace" : "Arial,sans-serif";
  const centeredX = position.endsWith("center");
  const centeredY = position.startsWith("center");
  const previewTransform = mosaic ? "none" : `${centeredX || centeredY ? `translate(${centeredX ? "-50%" : "0"},${centeredY ? "-50%" : "0"}) ` : ""}rotate(${rotation}deg)`;
  const markStyle = { color, opacity: 1 - transparency / 100, fontFamily: font, fontSize: `${Math.max(11, Math.min(34, fontSize / 1.5))}px`, fontWeight: bold ? 700 : 400, fontStyle: italic ? "italic" : "normal", textDecoration: underline ? "underline" : "none", transform: previewTransform };

  return <section className="watermark-screen">
    <header><button onClick={onClose}><ArrowLeft /> Voltar</button><div><strong>Marca d'água</strong><small>Personalize e confira antes de baixar</small></div><span><ShieldCheck /> Processamento local e privado</span></header>
    <main>
      <section className="watermark-preview-card">
        <header><div><span className="step-badge">1</span><div><strong>Pré-visualização</strong><small>Primeira página do documento</small></div></div>{file && <button className="replace-pdf" onClick={() => pdfInput.current?.click()}><UploadCloud /> Trocar PDF</button>}</header>
        {!file ? <button className="page-number-drop" onClick={() => pdfInput.current?.click()} onDrop={(event) => { event.preventDefault(); choosePdf(event.dataTransfer.files); }} onDragOver={(event) => event.preventDefault()}><UploadCloud /><strong>Selecionar um PDF</strong><small>ou arraste o arquivo para esta área</small></button> : <>
          <div className="page-number-file"><FileText /><span><strong>{file.name}</strong><small>{formatBytes(file.size)} · {total || "…"} página{total === 1 ? "" : "s"}</small></span><button onClick={() => setFile(null)}><X /></button></div>
          <div className="watermark-stage">{loading ? <LoaderCircle className="spin" /> : preview && <div className="watermark-paper"><img src={preview} />
            <div className={`watermark-live ${position} ${mosaic ? "mosaic" : ""}`} style={markStyle}>{Array.from({ length: mosaic ? 12 : 1 }, (_, index) => <span key={index} style={mosaic ? { transform: `rotate(${rotation}deg)` } : undefined}>{kind === "image" && imageUrl ? <img src={imageUrl} style={{ width: `${Math.max(70, imageScale * 4)}px` }} /> : text}</span>)}</div>
          </div>}</div>
        </>}
        <input ref={pdfInput} hidden type="file" accept="application/pdf,.pdf" onChange={(event) => choosePdf(event.target.files)} />
      </section>

      <aside className="watermark-options">
        <header><span className="step-badge">2</span><div><strong>Opções de marca d'água</strong><small>Texto ou imagem com controle completo</small></div></header>
        <div className="watermark-kind"><button className={kind === "text" ? "active" : ""} onClick={() => setKind("text")}><Type />Colocar texto</button><button className={kind === "image" ? "active" : ""} onClick={() => setKind("image")}><Image />Colocar imagem</button></div>
        {kind === "text" ? <><label className="wm-field"><span>Texto</span><input value={text} onChange={(event) => setText(event.target.value)} /></label><fieldset className="wm-format"><legend>Formato do texto</legend><select value={fontFamily} onChange={(event) => setFontFamily(event.target.value)}><option value="helvetica">Arial</option><option value="times">Times</option><option value="courier">Courier</option></select><input className="wm-size" type="number" min="8" max="144" value={fontSize} onChange={(event) => setFontSize(event.target.value)} /><button className={bold ? "active" : ""} onClick={() => setBold(!bold)}><Bold /></button><button className={italic ? "active" : ""} onClick={() => setItalic(!italic)}><Italic /></button><button className={underline ? "active" : ""} onClick={() => setUnderline(!underline)}><Underline /></button><input type="color" value={color} onChange={(event) => setColor(event.target.value)} /></fieldset></> : <><button className="wm-image-picker" onClick={() => imageInput.current?.click()}><FileImage /><span><strong>{markImage?.name || "Escolher imagem"}</strong><small>PNG, JPG, JPEG ou JFIF</small></span></button><input ref={imageInput} hidden type="file" accept="image/png,image/jpeg,.jfif" onChange={(event) => chooseImage(event.target.files)} /><label className="wm-range"><span>Tamanho da imagem <b>{imageScale}%</b></span><input type="range" min="5" max="80" value={imageScale} onChange={(event) => setImageScale(event.target.value)} /></label></>}
        <div className="wm-position"><fieldset><legend>Posição</legend><div className="number-position-grid">{positions.map((item) => <button key={item} className={position === item ? "active" : ""} onClick={() => setPosition(item)}><i /></button>)}</div></fieldset><label className="wm-check"><input type="checkbox" checked={mosaic} onChange={(event) => setMosaic(event.target.checked)} /> Mosaico</label></div>
        <div className="wm-two"><label className="wm-field"><span>Transparência</span><select value={transparency} onChange={(event) => setTransparency(Number(event.target.value))}><option value="0">Sem transparência</option><option value="25">25%</option><option value="50">50%</option><option value="65">65% recomendado</option><option value="80">80%</option><option value="90">90%</option></select></label><label className="wm-field"><span>Rotação</span><select value={rotation} onChange={(event) => setRotation(Number(event.target.value))}><option value="0">Não girar</option><option value="-45">-45°</option><option value="-30">-30°</option><option value="30">30°</option><option value="45">45°</option><option value="90">90°</option></select></label></div>
        <div className="wm-two"><label className="wm-field"><span>Da página</span><input type="number" min="1" max={total || 1} value={fromPage} onChange={(event) => setFromPage(event.target.value)} /></label><label className="wm-field"><span>Até a página</span><input type="number" min="1" max={total || 1} value={toPage} onChange={(event) => setToPage(event.target.value)} /></label></div>
        <fieldset className="wm-layer"><legend>Camada</legend><button className={layer === "above" ? "active" : ""} onClick={() => setLayer("above")}><Layers /><span>Acima do conteúdo<small>Marca sempre visível</small></span></button><button className={layer === "below" ? "active" : ""} onClick={() => setLayer("below")}><Layers /><span>Abaixo do conteúdo<small>Conteúdo em primeiro plano</small></span></button></fieldset>
        {error && <p className="page-number-error">{error}</p>}{success && <p className="page-number-success"><Check />{success}</p>}
        <button className="page-number-submit" disabled={!file || processing || (kind === "image" && !markImage) || (kind === "text" && !text.trim())} onClick={processPdf}>{processing ? <LoaderCircle className="spin" /> : <Download />}{processing ? "Aplicando…" : "Aplicar marca d'água e baixar"}</button>
      </aside>
    </main>
  </section>;
}
