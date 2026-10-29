import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, Clipboard, Download, FileImage, ImagePlus, LockKeyhole, Palette, Printer, QrCode, Save, Settings2, UploadCloud } from 'lucide-react';
import QRCode from 'qrcode';
import { jsPDF } from 'jspdf';
import { detectPixKeyType, generatePixPayload, validatePixData } from './features/pix/pixPayload';
import { calculatePixA4Layout, PIX_SIZES } from './features/pix/pixLayout';

const DPI = 300;
const mmToPx = (mm, dpi = DPI) => Math.round(mm / 25.4 * dpi);
const defaultData = { name: '', bank: '', city: '', key: '', keyType: '', amount: '', description: '', txid: '' };
const defaultDesign = { template: 'modern', size: '10x15', primary: '#087a40', secondary: '#18ad5d', background: '#ffffff', text: '#102a20', showName: true, showBank: true, showKey: true, showAmount: true, gap: 5, quantity: 1, cropMarks: true };
const templateChoices = [
  { id: 'simple', name: 'Simples', primary: '#17362a', secondary: '#eef3ef', background: '#ffffff', text: '#16251f' },
  { id: 'modern', name: 'Moderno', primary: '#087a40', secondary: '#18ad5d', background: '#ffffff', text: '#102a20' },
  { id: 'commercial', name: 'Comercial', primary: '#0a4928', secondary: '#f4cf18', background: '#fffef7', text: '#102a20' },
  { id: 'premium', name: 'Premium', primary: '#292722', secondary: '#a98b45', background: '#fffdf8', text: '#292722' },
  { id: 'accessible', name: 'Fácil leitura', primary: '#111111', secondary: '#f4cf18', background: '#ffffff', text: '#000000' },
  { id: 'blue', name: 'Azul', primary: '#0756c9', secondary: '#48a9f8', background: '#f3f8ff', text: '#082d66' },
];

function roundedRect(context, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath(); context.moveTo(x + r, y); context.arcTo(x + width, y, x + width, y + height, r);
  context.arcTo(x + width, y + height, x, y + height, r); context.arcTo(x, y + height, x, y, r);
  context.arcTo(x, y, x + width, y, r); context.closePath();
}

function fitText(context, text, maxWidth, initialSize, weight = 600) {
  let size = initialSize;
  do { context.font = `${weight} ${size}px Inter, Arial, sans-serif`; size -= 1; } while (context.measureText(text).width > maxWidth && size > 10);
  return size + 1;
}

async function imageFromSource(source) {
  if (!source) return null;
  return new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = source; });
}

async function createPlateCanvas({ data, design, payload, qrImage, logo, widthMm, heightMm, dpi = 150 }) {
  const canvas = document.createElement('canvas'), width = mmToPx(widthMm, dpi), height = mmToPx(heightMm, dpi);
  canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d'), unit = width / 1000;
  context.fillStyle = design.background; context.fillRect(0, 0, width, height);
  context.fillStyle = design.primary; context.fillRect(0, 0, width, Math.round(height * .15));
  context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillStyle = '#fff';
  context.font = `800 ${Math.max(25, 64 * unit)}px Inter, Arial, sans-serif`; context.fillText('PAGUE COM PIX', width / 2, height * .065);
  context.font = `500 ${Math.max(14, 25 * unit)}px Inter, Arial, sans-serif`; context.fillText('Rápido, simples e seguro', width / 2, height * .115);

  if (logo) {
    const logoImage = await imageFromSource(logo).catch(() => null);
    if (logoImage) {
      const logoSize = Math.min(width * .13, height * .08), x = width - logoSize - width * .035, y = height * .035;
      context.save(); roundedRect(context, x, y, logoSize, logoSize, logoSize * .18); context.clip(); context.drawImage(logoImage, x, y, logoSize, logoSize); context.restore();
    }
  }

  const qrSize = Math.min(width * .66, height * .42), qrX = (width - qrSize) / 2, qrY = height * .19;
  context.fillStyle = '#fff'; context.shadowColor = 'rgba(16,24,40,.15)'; context.shadowBlur = Math.max(8, 18 * unit);
  roundedRect(context, qrX - qrSize * .055, qrY - qrSize * .055, qrSize * 1.11, qrSize * 1.11, qrSize * .06); context.fill(); context.shadowColor = 'transparent';
  let qrSource = qrImage;
  if (!qrSource && payload) {
    const qrCanvas = document.createElement('canvas');
    await QRCode.toCanvas(qrCanvas, payload, { width: Math.round(qrSize), margin: 2, errorCorrectionLevel: 'M', color: { dark: '#101828', light: '#ffffff' } });
    qrSource = qrCanvas;
  }
  if (qrSource) {
    const image = typeof qrSource === 'string' ? await imageFromSource(qrSource).catch(() => null) : qrSource;
    if (image) context.drawImage(image, qrX, qrY, qrSize, qrSize);
  } else {
    context.strokeStyle = design.secondary; context.lineWidth = Math.max(3, 7 * unit); context.strokeRect(qrX, qrY, qrSize, qrSize);
    context.fillStyle = design.text; context.font = `700 ${Math.max(18, 34 * unit)}px Inter, Arial`; context.fillText('SEU QR CODE', width / 2, qrY + qrSize / 2);
  }

  let y = qrY + qrSize + height * .065;
  context.fillStyle = design.primary; context.font = `800 ${Math.max(18, 36 * unit)}px Inter, Arial`; context.fillText('APONTE A CÂMERA PARA PAGAR', width / 2, y);
  y += height * .075; context.fillStyle = design.text;
  const lines = [];
  if (design.showName && data.name) lines.push({ value: data.name, weight: 750 });
  if (design.showBank && data.bank) lines.push({ value: data.bank, weight: 500 });
  if (design.showKey && data.key) lines.push({ value: data.key, weight: 600 });
  if (design.showAmount && data.amount) lines.push({ value: `R$ ${Number(String(data.amount).replace(',', '.')).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, weight: 800 });
  lines.forEach((line, index) => { const size = fitText(context, line.value, width * .84, Math.max(18, (index === 0 ? 42 : 31) * unit), line.weight); context.font = `${line.weight} ${size}px Inter, Arial`; context.fillText(line.value, width / 2, y); y += height * .046; });
  context.fillStyle = design.primary; context.fillRect(0, height * .94, width, height * .06);
  context.fillStyle = '#fff'; context.font = `600 ${Math.max(12, 23 * unit)}px Inter, Arial`; context.fillText('Pagamento via Pix', width / 2, height * .97);
  return canvas;
}

function downloadCanvas(canvas, name) {
  canvas.toBlob((blob) => { if (!blob) return; const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1200); }, 'image/png');
}

export default function PixStudio({ onClose, onDone }) {
  const previewRef = useRef(null), logoInput = useRef(null), qrInput = useRef(null);
  const saved = useMemo(() => { try { return JSON.parse(localStorage.getItem('pl-studio-pix-profile') || 'null'); } catch { return null; } }, []);
  const [step, setStep] = useState(1), [mode, setMode] = useState('generate'), [data, setData] = useState(saved?.data || defaultData), [design, setDesign] = useState(saved?.design || defaultDesign);
  const [payload, setPayload] = useState(''), [qrImage, setQrImage] = useState(''), [logo, setLogo] = useState(saved?.logo || ''), [error, setError] = useState(''), [message, setMessage] = useState(''), [busy, setBusy] = useState(false), [previewBusy, setPreviewBusy] = useState(false);
  const size = PIX_SIZES[design.size] || PIX_SIZES['10x15'];
  const layout = useMemo(() => calculatePixA4Layout(size.width, size.height, Number(design.gap), 5, Number(design.quantity)), [size, design.gap, design.quantity]);
  const activePayload = mode === 'generate' ? payload : '';
  const ready = mode === 'generate' ? Boolean(payload) : Boolean(qrImage);

  useEffect(() => {
    let alive = true; setPreviewBusy(true);
    const timer = setTimeout(async () => {
      try { const canvas = await createPlateCanvas({ data, design, payload: activePayload, qrImage, logo, widthMm: size.width, heightMm: size.height, dpi: 110 }); if (alive && previewRef.current) { previewRef.current.width = canvas.width; previewRef.current.height = canvas.height; previewRef.current.getContext('2d').drawImage(canvas, 0, 0); } } finally { if (alive) setPreviewBusy(false); }
    }, 120);
    return () => { alive = false; clearTimeout(timer); };
  }, [data, design, activePayload, qrImage, logo, size]);

  const updateData = (field, value) => {
    const next = { ...data, [field]: value };
    if (field === 'key') { const detected = detectPixKeyType(value); if (detected) next.keyType = detected; }
    setData(next); setPayload(''); setMessage('');
  };
  const generate = async () => { const validation = validatePixData(data); if (validation) { setError(validation); return; } setError(''); setPayload(generatePixPayload(data)); setMessage('QR Code Pix gerado e pronto para personalizar.'); setStep(2); };
  const chooseImage = (file, setter, after) => { if (!file) return; if (!/^image\/(png|jpe?g|webp)$/i.test(file.type)) { setError('Selecione uma imagem PNG, JPG ou WebP.'); return; } const reader = new FileReader(); reader.onload = () => { setter(reader.result); after?.(); }; reader.readAsDataURL(file); };
  const saveProfile = () => { localStorage.setItem('pl-studio-pix-profile', JSON.stringify({ data: { ...data, key: '', amount: '', description: '', txid: '' }, design, logo })); setMessage('Perfil salvo somente neste computador. A chave Pix não foi armazenada.'); };
  const copyPayload = async () => { if (!payload) return; await navigator.clipboard.writeText(payload); setMessage('Pix Copia e Cola copiado.'); };
  const makeCanvas = (dpi = DPI) => createPlateCanvas({ data, design, payload: activePayload, qrImage, logo, widthMm: size.width, heightMm: size.height, dpi });
  const exportPng = async () => { if (!ready) return; setBusy(true); try { const canvas = await makeCanvas(); downloadCanvas(canvas, `placa-pix-${size.width}x${size.height}mm.png`); setMessage('PNG gerado em 300 DPI.'); onDone?.({ name: 'Placa Pix PNG' }, canvas.width * canvas.height * 4); } finally { setBusy(false); } };
  const exportPdf = async () => { if (!ready) return; setBusy(true); try { const canvas = await makeCanvas(180), pdf = new jsPDF({ unit: 'mm', format: [size.width, size.height], orientation: size.width > size.height ? 'landscape' : 'portrait' }); pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, size.width, size.height, undefined, 'FAST'); const blob = pdf.output('blob'); pdf.save(`placa-pix-${size.width}x${size.height}mm.pdf`); setMessage('PDF da placa gerado nas medidas selecionadas.'); onDone?.({ name: 'Placa Pix PDF' }, blob.size); } finally { setBusy(false); } };
  const createA4 = async () => {
    if (!ready || !layout.capacity) throw new Error('O tamanho escolhido não cabe na folha A4.');
    const source = await makeCanvas(150), card = layout.rotated ? (() => { const c = document.createElement('canvas'); c.width = source.height; c.height = source.width; const ctx = c.getContext('2d'); ctx.translate(c.width, 0); ctx.rotate(Math.PI / 2); ctx.drawImage(source, 0, 0); return c; })() : source;
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' }), image = card.toDataURL('image/png');
    layout.positions.forEach(position => { pdf.addImage(image, 'PNG', position.x, position.y, position.width, position.height, undefined, 'FAST'); if (design.cropMarks) { pdf.setDrawColor(120); pdf.setLineWidth(.15); pdf.rect(position.x, position.y, position.width, position.height); } });
    return pdf;
  };
  const exportA4 = async (print = false) => { setBusy(true); setError(''); try { const pdf = await createA4(), blob = pdf.output('blob'); if (print) { const url = URL.createObjectURL(blob); window.open(url, '_blank'); setTimeout(() => URL.revokeObjectURL(url), 60000); setMessage('Prévia aberta. Imprima em Tamanho real ou 100%.'); } else { pdf.save('placa-pix-folha-a4.pdf'); setMessage(`Folha A4 gerada com ${layout.count} cópia(s).`); } onDone?.({ name: 'Placa Pix A4' }, blob.size); } catch (exception) { setError(exception.message); } finally { setBusy(false); } };
  const chooseTemplate = (template) => setDesign(value => ({ ...value, template: template.id, primary: template.primary, secondary: template.secondary, background: template.background, text: template.text }));

  return <div className="pix-studio">
    <header className="pix-top"><button onClick={onClose}><ArrowLeft/></button><div className="pl-wordmark"><span>PL</span><strong>STUDIO</strong></div><div><strong>Pix e QR Code</strong><small>Geração local · nenhuma chave é enviada</small></div><span><LockKeyhole/> Processamento local</span></header>
    <div className="pix-steps"><button className={step === 1 ? 'active' : ''} onClick={() => setStep(1)}><b>1</b> Dados do Pix</button><i/><button disabled={!ready} className={step === 2 ? 'active' : ''} onClick={() => setStep(2)}><b>2</b> Personalizar placa</button><i/><button disabled={!ready} className={step === 3 ? 'active' : ''} onClick={() => setStep(3)}><b>3</b> Baixar e imprimir</button></div>
    <main className="pix-workspace">
      <section className="pix-preview-panel"><header><div><span>Pré-visualização</span><strong>{size.label} · {size.width} × {size.height} mm</strong></div><em>{ready ? <><Check/> Pronto</> : 'Aguardando QR Code'}</em></header><div className="pix-preview-stage">{previewBusy && <span className="spinner purple-spin"/>}<canvas ref={previewRef}/></div><footer><span><QrCode/> {mode === 'generate' ? 'QR Code Pix estático' : 'Imagem de QR Code existente'}</span><span>{layout.capacity ? `Cabem até ${layout.capacity} por folha A4` : 'Não cabe em A4'}</span></footer></section>
      <aside className={`pix-controls pix-step-${step}`}>
        {step === 1 && <><nav className="pix-mode"><button className={mode === 'generate' ? 'active' : ''} onClick={() => { setMode('generate'); setError(''); }}><QrCode/> Gerar Pix</button><button className={mode === 'upload' ? 'active' : ''} onClick={() => { setMode('upload'); setError(''); }}><UploadCloud/> Usar QR pronto</button></nav>
        {mode === 'generate' ? <section className="pix-control-section"><header><span>1</span><div><strong>Dados do pagamento</strong><small>A chave é usada apenas para montar o código</small></div></header><div className="pix-form-grid"><label className="wide">Nome do recebedor<input value={data.name} maxLength={25} onChange={event => updateData('name', event.target.value)} placeholder="Ex.: João da Silva"/></label><label>Banco <span>opcional</span><input value={data.bank} onChange={event => updateData('bank', event.target.value)} placeholder="Ex.: Banco do Brasil"/></label><label>Cidade<input value={data.city} maxLength={15} onChange={event => updateData('city', event.target.value)} placeholder="Ex.: Rio de Janeiro"/></label><label className="wide">Chave Pix<input value={data.key} onChange={event => updateData('key', event.target.value)} placeholder="CPF, CNPJ, celular, e-mail ou chave aleatória"/><small>{data.keyType ? `Tipo identificado: ${data.keyType.toUpperCase()}` : 'O tipo será identificado automaticamente.'}</small></label><label>Tipo<select value={data.keyType} onChange={event => updateData('keyType', event.target.value)}><option value="">Selecione</option><option value="cpf">CPF</option><option value="cnpj">CNPJ</option><option value="phone">Celular</option><option value="email">E-mail</option><option value="random">Chave aleatória</option></select></label><label>Valor <span>opcional</span><input value={data.amount} inputMode="decimal" onChange={event => updateData('amount', event.target.value)} placeholder="0,00"/></label><label className="wide">Descrição <span>opcional</span><input value={data.description} maxLength={72} onChange={event => updateData('description', event.target.value)} placeholder="Ex.: Pagamento do pedido"/></label><label>Identificador <span>opcional</span><input value={data.txid} maxLength={25} onChange={event => updateData('txid', event.target.value)} placeholder="PEDIDO123"/></label></div><button className="pix-generate" onClick={generate}><QrCode/> Gerar QR Code e personalizar</button>{payload && <button className="pix-copy" onClick={copyPayload}><Clipboard/> Copiar Pix Copia e Cola</button>}</section> : <section className="pix-control-section pix-upload-section"><header><span>1</span><div><strong>Usar QR Code existente</strong><small>Envie uma imagem pronta</small></div></header><input ref={qrInput} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={event => chooseImage(event.target.files[0], setQrImage, () => setStep(2))}/><button className="pix-upload" onClick={() => qrInput.current.click()}><ImagePlus/><strong>{qrImage ? 'Trocar imagem do QR Code' : 'Selecionar imagem do QR Code'}</strong><small>PNG, JPG ou WebP</small></button></section>}</>}
        {step === 2 && <details className="pix-control-section" open><summary><span>2</span><div><strong>Personalizar placa</strong><small>Modelo, tamanho e informações</small></div><Settings2/></summary><div className="pix-template-grid">{templateChoices.map(template => <button key={template.id} className={design.template === template.id ? 'active' : ''} onClick={() => chooseTemplate(template)} style={{ '--pix-primary': template.primary, '--pix-secondary': template.secondary }}><i/><span>{template.name}</span></button>)}</div><label>Tamanho da placa<select value={design.size} onChange={event => setDesign(value => ({ ...value, size: event.target.value }))}>{Object.entries(PIX_SIZES).map(([id, item]) => <option key={id} value={id}>{item.label}</option>)}</select></label><div className="pix-color-row"><label>Principal<input type="color" value={design.primary} onChange={event => setDesign(value => ({ ...value, primary: event.target.value }))}/></label><label>Secundária<input type="color" value={design.secondary} onChange={event => setDesign(value => ({ ...value, secondary: event.target.value }))}/></label><label>Fundo<input type="color" value={design.background} onChange={event => setDesign(value => ({ ...value, background: event.target.value }))}/></label></div><div className="pix-checks"><label><input type="checkbox" checked={design.showName} onChange={event => setDesign(value => ({ ...value, showName: event.target.checked }))}/> Nome</label><label><input type="checkbox" checked={design.showBank} onChange={event => setDesign(value => ({ ...value, showBank: event.target.checked }))}/> Banco</label><label><input type="checkbox" checked={design.showKey} onChange={event => setDesign(value => ({ ...value, showKey: event.target.checked }))}/> Chave</label><label><input type="checkbox" checked={design.showAmount} onChange={event => setDesign(value => ({ ...value, showAmount: event.target.checked }))}/> Valor</label></div><input ref={logoInput} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={event => chooseImage(event.target.files[0], setLogo)}/><button className="pix-secondary-action" onClick={() => logoInput.current.click()}><ImagePlus/> {logo ? 'Trocar logo' : 'Adicionar logo'}</button><button className="pix-secondary-action" onClick={saveProfile}><Save/> Salvar padrões da loja</button><div className="pix-step-actions"><button onClick={() => setStep(1)}>Voltar aos dados</button><button className="primary" onClick={() => setStep(3)}>Continuar para baixar</button></div></details>}
        {step === 3 && <details className="pix-control-section" open><summary><span>3</span><div><strong>Baixar e imprimir</strong><small>Arquivos nas medidas exatas</small></div><Printer/></summary><div className="pix-print-summary"><QrCode/><span><strong>Placa pronta</strong><small>{size.label} · {size.width} × {size.height} mm</small></span><Check/></div><div className="pix-print-grid"><label>Quantidade na A4<input type="number" min="1" max={Math.max(1, layout.capacity)} value={design.quantity} onChange={event => setDesign(value => ({ ...value, quantity: Math.max(1, Math.min(Number(event.target.value), Math.max(1, layout.capacity))) }))}/></label><label>Espaço entre placas (mm)<input type="number" min="0" max="30" value={design.gap} onChange={event => setDesign(value => ({ ...value, gap: Number(event.target.value) }))}/></label></div><label className="pix-crop-check"><input type="checkbox" checked={design.cropMarks} onChange={event => setDesign(value => ({ ...value, cropMarks: event.target.checked }))}/> Mostrar linha de recorte</label><div className="pix-download-grid"><button disabled={!ready || busy} onClick={exportPng}><FileImage/> PNG <small>300 DPI</small></button><button disabled={!ready || busy} onClick={exportPdf}><Download/> PDF <small>Placa individual</small></button><button disabled={!ready || busy || !layout.capacity} onClick={() => exportA4(false)}><Download/> PDF A4 <small>{layout.count} cópia(s)</small></button><button disabled={!ready || busy || !layout.capacity} onClick={() => exportA4(true)}><Printer/> Imprimir <small>Tamanho real</small></button></div><div className="pix-step-actions"><button onClick={() => setStep(2)}>Voltar e personalizar</button></div></details>}
        {error && <div className="pix-error">{error}</div>}{message && <div className="pix-success"><Check/> {message}</div>}
      </aside>
    </main>
  </div>;
}
