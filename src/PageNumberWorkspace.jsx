import React, { useEffect, useRef, useState } from "react";
import { ArrowLeft, Bold, Check, ChevronLeft, ChevronRight, Download, FileText, Italic, LoaderCircle, ShieldCheck, Underline, UploadCloud, X } from "lucide-react";
import * as pdfjs from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { preparePdfFiles } from "./pdfSecurity";
import { addPageNumbers, effectivePosition, pageNumberLabel } from "./features/pdf/pageNumbering";
import { downloadFile, fileStem, formatBytes } from "./shared/files";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;

const margins = {
  narrow: { label: "Pequena", points: 14 },
  recommended: { label: "Recomendada", points: 28 },
  wide: { label: "Ampla", points: 42 },
};
const positions = ["top-left", "top-center", "top-right", "center-left", "center-center", "center-right", "bottom-left", "bottom-center", "bottom-right"];
const positionNames = {
  "top-left": "Superior esquerda", "top-center": "Superior central", "top-right": "Superior direita",
  "center-left": "Centro esquerda", "center-center": "Centro", "center-right": "Centro direita",
  "bottom-left": "Inferior esquerda", "bottom-center": "Inferior central", "bottom-right": "Inferior direita",
};
const formatNames = { number: "Somente o número — 1", page: "Página 1", total: "1 de 10", "page-total": "Página 1 de 10" };

async function renderPage(file, requestedPage) {
  const document = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pageNumber = Math.max(1, Math.min(document.numPages, requestedPage));
  const page = await document.getPage(pageNumber);
  const viewport = page.getViewport({ scale: 1.35 });
  const canvas = window.document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const context = canvas.getContext("2d", { alpha: false });
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: context, viewport }).promise;
  return { image: canvas.toDataURL("image/jpeg", 0.92), page: pageNumber, total: document.numPages };
}

export default function PageNumberWorkspace({ tool, initialFile, onClose, onDone }) {
  const inputRef = useRef(null);
  const [file, setFile] = useState(initialFile || null);
  const [preview, setPreview] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [duplex, setDuplex] = useState(false);
  const [position, setPosition] = useState("bottom-right");
  const [margin, setMargin] = useState("recommended");
  const [start, setStart] = useState(1);
  const [format, setFormat] = useState("number");
  const [fontFamily, setFontFamily] = useState("helvetica");
  const [fontSize, setFontSize] = useState(11);
  const [bold, setBold] = useState(false);
  const [italic, setItalic] = useState(false);
  const [underline, setUnderline] = useState(false);
  const [color, setColor] = useState("#222222");

  useEffect(() => {
    if (!file) { setPreview(""); setTotal(0); return undefined; }
    let active = true;
    setLoadingPreview(true);
    setError("");
    renderPage(file, page)
      .then((result) => { if (active) { setPreview(result.image); setPage(result.page); setTotal(result.total); } })
      .catch((reason) => active && setError(`Não foi possível visualizar o PDF: ${reason.message || reason}`))
      .finally(() => active && setLoadingPreview(false));
    return () => { active = false; };
  }, [file, page]);

  async function selectFiles(fileList) {
    try {
      const selected = Array.from(fileList || []).filter((item) => item.name.toLowerCase().endsWith(".pdf"));
      if (!selected.length) return;
      const [prepared] = await preparePdfFiles(selected.slice(0, 1));
      setFile(prepared); setPage(1); setError(""); setSuccess("");
    } catch (reason) { setError(reason.message || String(reason)); }
  }

  async function processPdf() {
    if (!file || processing) return;
    setProcessing(true); setError(""); setSuccess("");
    try {
      const result = await addPageNumbers(new Uint8Array(await file.arrayBuffer()), {
        duplex, position, marginPt: margins[margin].points, start, format, fontFamily, fontSize, bold, italic, underline, color,
      });
      const outputName = `${fileStem(file.name)}-numerado.pdf`;
      downloadFile(result, outputName);
      setSuccess(`${outputName} foi gerado com ${total} página${total === 1 ? "" : "s"}.`);
      onDone?.(tool, [file], result.length);
    } catch (reason) { setError(`Não foi possível numerar o PDF: ${reason.message || reason}`); }
    finally { setProcessing(false); }
  }

  const actualPosition = effectivePosition(position, duplex, page - 1);
  const firstNumber = Number(start) || 1;
  const overlayLabel = pageNumberLabel(firstNumber + page - 1, firstNumber + Math.max(total - 1, 0), format);
  const overlayFont = fontFamily === "times" ? "Georgia, serif" : fontFamily === "courier" ? "Courier New, monospace" : "Arial, sans-serif";

  return <section className="page-number-screen">
    <header>
      <button type="button" onClick={onClose}><ArrowLeft /> Voltar</button>
      <div><strong>Inserir números de página</strong><small>Configure e acompanhe o resultado antes de baixar</small></div>
      <span><ShieldCheck /> Processamento local e privado</span>
    </header>
    <main>
      <section className="page-number-preview-card">
        <header>
          <div><span className="step-badge">1</span><div><strong>Pré-visualização</strong><small>O número acompanha suas configurações</small></div></div>
          {file && <button type="button" className="replace-pdf" onClick={() => inputRef.current?.click()}><UploadCloud /> Trocar PDF</button>}
        </header>
        {!file ? <button type="button" className="page-number-drop" onClick={() => inputRef.current?.click()} onDrop={(event) => { event.preventDefault(); selectFiles(event.dataTransfer.files); }} onDragOver={(event) => event.preventDefault()}>
          <UploadCloud /><strong>Selecionar um PDF</strong><small>ou arraste o arquivo para esta área</small>
        </button> : <>
          <div className="page-number-file"><FileText /><span><strong>{file.name}</strong><small>{formatBytes(file.size)} · {total || "…"} página{total === 1 ? "" : "s"}</small></span><button type="button" aria-label="Remover PDF" onClick={() => setFile(null)}><X /></button></div>
          <div className="page-number-stage">
            {loadingPreview ? <div className="page-number-loading"><LoaderCircle className="spin" /> Preparando página…</div> : preview ? <div className="page-number-paper">
              <img src={preview} alt={`Pré-visualização da página ${page}`} />
              <span className={`page-number-live ${actualPosition}`} style={{ "--number-inset": margin === "narrow" ? "2.5%" : margin === "wide" ? "6%" : "4%", color, fontFamily: overlayFont, fontSize: `${Math.max(9, Math.min(24, Number(fontSize) || 11))}px`, fontWeight: bold ? 700 : 400, fontStyle: italic ? "italic" : "normal", textDecoration: underline ? "underline" : "none" }}>{overlayLabel}</span>
            </div> : null}
          </div>
          <nav className="page-number-pagination" aria-label="Navegação pelas páginas">
            <button type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}><ChevronLeft /></button><span>Página <strong>{page}</strong> de {total || 1}</span><button type="button" disabled={page >= total} onClick={() => setPage((value) => value + 1)}><ChevronRight /></button>
          </nav>
        </>}
        <input ref={inputRef} hidden type="file" accept="application/pdf,.pdf" onChange={(event) => selectFiles(event.target.files)} />
      </section>

      <aside className="page-number-options">
        <header><span className="step-badge">2</span><div><strong>Opções de numeração</strong><small>Defina como o número aparecerá</small></div></header>
        <fieldset className="number-mode"><legend>Modo de página</legend>
          <label><input type="radio" name="page-mode" checked={!duplex} onChange={() => setDuplex(false)} /> Página única</label>
          <label><input type="radio" name="page-mode" checked={duplex} onChange={() => setDuplex(true)} /> Páginas espelhadas</label>
          <small>{duplex ? "Alterna esquerda e direita na impressão frente e verso." : "Repete a mesma posição em todas as páginas."}</small>
        </fieldset>
        <div className="number-position-row">
          <fieldset><legend>Posição</legend><div className="number-position-grid">{positions.map((item) => <button key={item} type="button" className={position === item ? "active" : ""} title={positionNames[item]} aria-label={positionNames[item]} onClick={() => setPosition(item)}><i /></button>)}</div></fieldset>
          <label className="number-field"><span>Margem</span><select value={margin} onChange={(event) => setMargin(event.target.value)}>{Object.entries(margins).map(([value, option]) => <option key={value} value={value}>{option.label}</option>)}</select></label>
        </div>
        <div className="number-two-fields">
          <label className="number-field"><span>Primeiro número</span><input type="number" min="-9999" max="999999" value={start} onChange={(event) => setStart(event.target.value)} /></label>
          <label className="number-field"><span>Tamanho</span><input type="number" min="6" max="72" value={fontSize} onChange={(event) => setFontSize(event.target.value)} /></label>
        </div>
        <label className="number-field"><span>Texto exibido</span><select value={format} onChange={(event) => setFormat(event.target.value)}>{Object.entries(formatNames).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <fieldset className="number-formatting"><legend>Formato do texto</legend>
          <select aria-label="Fonte" value={fontFamily} onChange={(event) => setFontFamily(event.target.value)}><option value="helvetica">Arial</option><option value="times">Times</option><option value="courier">Courier</option></select>
          <button type="button" className={bold ? "active" : ""} aria-label="Negrito" onClick={() => setBold((value) => !value)}><Bold /></button>
          <button type="button" className={italic ? "active" : ""} aria-label="Itálico" onClick={() => setItalic((value) => !value)}><Italic /></button>
          <button type="button" className={underline ? "active" : ""} aria-label="Sublinhado" onClick={() => setUnderline((value) => !value)}><Underline /></button>
          <label className="number-color" title="Cor do texto"><input type="color" value={color} onChange={(event) => setColor(event.target.value)} /></label>
        </fieldset>
        {error && <p className="page-number-error">{error}</p>}
        {success && <p className="page-number-success"><Check /> {success}</p>}
        <button type="button" className="page-number-submit" disabled={!file || processing} onClick={processPdf}>{processing ? <LoaderCircle className="spin" /> : <Download />}{processing ? "Inserindo numeração…" : "Inserir números e baixar"}</button>
        <p className="page-number-local"><ShieldCheck /> Seu arquivo não é enviado para a internet.</p>
      </aside>
    </main>
  </section>;
}
