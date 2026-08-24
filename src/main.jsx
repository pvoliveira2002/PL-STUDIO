import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib';
import JSZip from 'jszip';
import * as pdfjs from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {
  ArrowRight, BadgeCheck, BookOpen, Check, ChevronDown, ChevronLeft, ChevronRight,
  CircleHelp, Combine, Download, FileArchive, FileImage, FileOutput, FilePenLine,
  FilePlus2, FileSpreadsheet, FileText, Files, FolderOpen, GripVertical, History, House, Image, Images,
  Layers3, LockKeyhole, Menu, MonitorCheck, Moon, MoreHorizontal, PackageCheck,
  Eye, PanelTop, Presentation, RotateCw, ScanText, Search, ShieldCheck, Sparkles,
  Printer, Settings, Split, Stamp, Sun, Trash2, UploadCloud, Wrench, X, Zap
} from 'lucide-react';
import ImageStudio from './ImageStudio';
import PdfWorkbench from './PdfWorkbench';
import './styles.css';

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;

const tools = [
  { id:'merge', title:'Juntar PDF', desc:'Combine vários PDFs na ordem que quiser.', cat:'Organizar', icon:Combine, tone:'coral', multi:true, accept:'.pdf' },
  { id:'split', title:'Dividir PDF', desc:'Extraia páginas ou separe o documento inteiro.', cat:'Organizar', icon:Split, tone:'coral', accept:'.pdf' },
  { id:'compress', title:'Comprimir PDF', desc:'Reduza o tamanho mantendo a melhor qualidade.', cat:'Otimizar', icon:FileArchive, tone:'green', accept:'.pdf' },
  { id:'pdf-word', title:'PDF para Word', desc:'Transforme o texto do PDF em um DOCX editável.', cat:'Converter', icon:FileText, tone:'blue', accept:'.pdf' },
  { id:'pdf-ppt', title:'PDF para PowerPoint', desc:'Crie slides PPTX visualmente fiéis ao PDF.', cat:'Converter', icon:Presentation, tone:'orange', accept:'.pdf' },
  { id:'pdf-excel', title:'PDF para Excel', desc:'Extraia o conteúdo textual para planilhas.', cat:'Converter', icon:FileSpreadsheet, tone:'green', accept:'.pdf' },
  { id:'word-pdf', title:'Word para PDF', desc:'Converta documentos DOCX para PDF.', cat:'Converter', icon:FileOutput, tone:'blue', accept:'.docx' },
  { id:'ppt-pdf', title:'PowerPoint para PDF', desc:'Converta o conteúdo textual de PPTX para PDF.', cat:'Converter', icon:Presentation, tone:'orange', accept:'.pptx' },
  { id:'excel-pdf', title:'Excel para PDF', desc:'Converta planilhas XLS e XLSX para PDF.', cat:'Converter', icon:FileSpreadsheet, tone:'green', accept:'.xls,.xlsx' },
  { id:'edit', title:'Editar PDF', desc:'Adicione uma anotação de texto ao documento.', cat:'Editar', icon:FilePenLine, tone:'purple', accept:'.pdf' },
  { id:'pdf-jpg', title:'PDF para JPG', desc:'Transforme páginas de um ou vários PDFs em imagens JPG.', cat:'Converter', icon:Image, tone:'yellow', accept:'.pdf', multi:true },
  { id:'jpg-pdf', title:'JPG para PDF', desc:'Converta imagens em um único PDF.', cat:'Converter', icon:FileImage, tone:'yellow', accept:'image/jpeg,image/png', multi:true },
  { id:'sign', title:'Assinar PDF', desc:'Inclua uma assinatura visual no documento.', cat:'Editar', icon:FilePenLine, tone:'navy', accept:'.pdf' },
  { id:'watermark', title:"Marca d'água", desc:'Aplique texto com posição e transparência.', cat:'Editar', icon:Stamp, tone:'purple', accept:'.pdf' },
  { id:'rotate', title:'Rodar PDF', desc:'Gire todas as páginas em poucos cliques.', cat:'Organizar', icon:RotateCw, tone:'purple', accept:'.pdf' },
  { id:'html-pdf', title:'HTML para PDF', desc:'Converta um arquivo HTML ou texto em PDF.', cat:'Converter', icon:PanelTop, tone:'yellow', accept:'.html,.htm,.txt' },
  { id:'unlock', title:'Desbloquear PDF', desc:'Remova a senha usando a credencial atual.', cat:'Segurança', icon:LockKeyhole, tone:'navy', accept:'.pdf', cloud:true },
  { id:'protect', title:'Proteger PDF', desc:'Defina uma senha para proteger o arquivo.', cat:'Segurança', icon:ShieldCheck, tone:'navy', accept:'.pdf' },
  { id:'organize', title:'Organizar PDF', desc:'Reordene, exclua e selecione páginas.', cat:'Organizar', icon:GripVertical, tone:'coral', accept:'.pdf' },
  { id:'pdfa', title:'PDF para PDF/A', desc:'Prepare o documento para arquivamento.', cat:'Otimizar', icon:FileOutput, tone:'blue', accept:'.pdf', cloud:true },
  { id:'repair', title:'Reparar PDF', desc:'Reconstrua a estrutura de um PDF danificado.', cat:'Otimizar', icon:Wrench, tone:'green', accept:'.pdf' },
  { id:'numbers', title:'Números de página', desc:'Numere as páginas com estilo personalizado.', cat:'Editar', icon:Layers3, tone:'purple', accept:'.pdf' },
  { id:'scan', title:'Digitalizar para PDF', desc:'Capture documentos com a câmera.', cat:'Criar', icon:ScanText, tone:'coral', accept:'image/*', multi:true },
  { id:'ocr', title:'OCR PDF', desc:'Torne PDFs escaneados pesquisáveis em português.', cat:'Otimizar', icon:ScanText, tone:'green', accept:'.pdf' },
];
tools.push(
 { id:'pdf-editor', title:'Editor PDF completo', desc:'Edite páginas, texto, assinatura e marca d’água no mesmo lugar.', cat:'Editar', icon:FilePenLine, tone:'coral', accept:'.pdf' },
 { id:'image-converter', title:'Converter imagens', desc:'Converta, redimensione e otimize imagens em lote.', cat:'Imagens', icon:Images, tone:'coral', accept:'image/*', multi:true },
 { id:'print-a4', title:'Imagens em folha A4', desc:'Distribua várias imagens automaticamente para impressão.', cat:'Impressão', icon:Printer, tone:'blue', accept:'image/jpeg,image/png', multi:true },
 { id:'photo-3x4', title:'Fotos 3x4', desc:'Prepare várias cópias de uma foto em folha A4.', cat:'Impressão', icon:Image, tone:'purple', accept:'image/jpeg,image/png' },
);
const featuredIds = ['pdf-editor','merge','compress','pdf-jpg','jpg-pdf','scan'];
const quickToolIds = ['pdf-editor','compress','split','pdf-jpg','organize','rotate','watermark','numbers'];
const categories = ['Todas','Imagens','Impressão','Organizar','Converter','Editar','Otimizar','Segurança','Criar'];

function formatBytes(n){ if(!n) return '0 KB'; const u=['B','KB','MB','GB']; const i=Math.min(Math.floor(Math.log(n)/Math.log(1024)),3); return `${(n/1024**i).toFixed(i?1:0)} ${u[i]}`; }
function download(bytes,name,type='application/pdf'){ const blob=bytes instanceof Blob?bytes:new Blob([bytes],{type}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500); }
function stem(name){return name.replace(/\.[^.]+$/,'');}
async function readPdfTextAndImages(file,withImages=false){
 const pdf=await pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise;const pages=[];
 for(let i=1;i<=pdf.numPages;i++){const page=await pdf.getPage(i);const content=await page.getTextContent();const lines=[];let lastY=null,current='';for(const item of content.items){const y=Math.round(item.transform?.[5]||0);if(lastY!==null&&Math.abs(y-lastY)>4){if(current.trim())lines.push(current.trim());current=''}current+=`${item.str} `;lastY=y}if(current.trim())lines.push(current.trim());let image=null;if(withImages){const viewport=page.getViewport({scale:1.6});const canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;image=canvas.toDataURL('image/jpeg',.88)}pages.push({lines,image})}return pages;
}
async function textPagesToPdf(pages,title){
 const {jsPDF}=await import('jspdf');const pdf=new jsPDF({unit:'pt',format:'a4'});const width=pdf.internal.pageSize.getWidth(),height=pdf.internal.pageSize.getHeight();
 pages.forEach((content,pageIndex)=>{if(pageIndex>0)pdf.addPage();pdf.setFont('helvetica','bold');pdf.setFontSize(14);pdf.text(title,42,42);pdf.setFont('helvetica','normal');pdf.setFontSize(10);let y=66;const lines=Array.isArray(content)?content:String(content||'').split(/\r?\n/);for(const raw of lines){const wrapped=pdf.splitTextToSize(String(raw||' '),width-84);for(const line of wrapped){if(y>height-42){pdf.addPage();y=42}pdf.text(line,42,y);y+=14}}});return pdf.output('arraybuffer');
}
async function imagesToPptx(images){
 const zip=new JSZip(),slideIds=images.map((_,i)=>`<p:sldId id="${256+i}" r:id="rId${i+2}"/>`).join(''),slideRels=images.map((_,i)=>`<Relationship Id="rId${i+2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i+1}.xml"/>`).join(''),slideTypes=images.map((_,i)=>`<Override PartName="/ppt/slides/slide${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join('');
 zip.file('[Content_Types].xml',`<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="jpeg" ContentType="image/jpeg"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>${slideTypes}</Types>`);
 zip.file('_rels/.rels','<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>');
 zip.file('ppt/presentation.xml',`<?xml version="1.0" encoding="UTF-8"?><p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>${slideIds}</p:sldIdLst><p:sldSz cx="12192000" cy="6858000" type="screen16x9"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`);
 zip.file('ppt/_rels/presentation.xml.rels',`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>${slideRels}</Relationships>`);
 zip.file('ppt/slideMasters/slideMaster1.xml','<?xml version="1.0" encoding="UTF-8"?><p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld><p:clrMap accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" bg1="lt1" bg2="lt2" folHlink="folHlink" hlink="hlink" tx1="dk1" tx2="dk2"/><p:sldLayoutIdLst><p:sldLayoutId id="1" r:id="rId1"/></p:sldLayoutIdLst></p:sldMaster>');
 zip.file('ppt/slideMasters/_rels/slideMaster1.xml.rels','<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/></Relationships>');
 zip.file('ppt/slideLayouts/slideLayout1.xml','<?xml version="1.0" encoding="UTF-8"?><p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank"><p:cSld name="Blank"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>');
 zip.file('ppt/slideLayouts/_rels/slideLayout1.xml.rels','<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>');
 zip.file('ppt/theme/theme1.xml','<?xml version="1.0" encoding="UTF-8"?><a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="PDFly"><a:themeElements><a:clrScheme name="PDFly"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="20252D"/></a:dk2><a:lt2><a:srgbClr val="F5F6F8"/></a:lt2><a:accent1><a:srgbClr val="FF343B"/></a:accent1><a:accent2><a:srgbClr val="666666"/></a:accent2><a:accent3><a:srgbClr val="999999"/></a:accent3><a:accent4><a:srgbClr val="CCCCCC"/></a:accent4><a:accent5><a:srgbClr val="444444"/></a:accent5><a:accent6><a:srgbClr val="EEEEEE"/></a:accent6><a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink></a:clrScheme><a:fontScheme name="Office"><a:majorFont/><a:minorFont/></a:fontScheme><a:fmtScheme name="Office"><a:fillStyleLst/><a:lnStyleLst/><a:effectStyleLst/><a:bgFillStyleLst/></a:fmtScheme></a:themeElements></a:theme>');
 for(let i=0;i<images.length;i++){const n=i+1;zip.file(`ppt/slides/slide${n}.xml`,`<?xml version="1.0" encoding="UTF-8"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/><p:pic><p:nvPicPr><p:cNvPr id="2" name="Página ${n}"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="12192000" cy="6858000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`);zip.file(`ppt/slides/_rels/slide${n}.xml.rels`,`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image${n}.jpeg"/></Relationships>`);zip.file(`ppt/media/image${n}.jpeg`,await (await fetch(images[i])).arrayBuffer())}
 return zip.generateAsync({type:'blob',mimeType:'application/vnd.openxmlformats-officedocument.presentationml.presentation'});
}

function Header({dark,setDark,onHistory,onOpen,onHome}){
 return <header className="header"><div className="nav shell">
   <a className="brand pl-brand" href="#" aria-label="Voltar ao início" onClick={e=>{e.preventDefault();onHome?.()}}><span>PL</span><strong>STUDIO</strong></a>
   <nav className="main-menu">
    <button onClick={()=>onOpen(tools.find(t=>t.id==='merge'))}>Juntar PDF</button>
    <button onClick={()=>onOpen(tools.find(t=>t.id==='split'))}>Dividir PDF</button>
    <button onClick={()=>onOpen(tools.find(t=>t.id==='compress'))}>Comprimir PDF</button>
    <div className="nav-dropdown"><button>Converter PDF <ChevronDown size={14}/></button><div className="dropdown-menu">
      {tools.filter(t=>t.cat==='Converter').map(t=>{const I=t.icon;return <button key={t.id} disabled={t.cloud} onClick={()=>!t.cloud&&onOpen(t)}><span className={`mini-icon ${t.tone}`}><I/></span><span>{t.title}</span>{t.cloud&&<em>Em breve</em>}</button>})}
    </div></div>
    <div className="nav-dropdown all-tools"><button>Todas as ferramentas <ChevronDown size={14}/></button><div className="dropdown-menu mega-menu">
      {categories.slice(1).map(c=><div className="menu-column" key={c}><strong>{c}</strong>{tools.filter(t=>t.cat===c).map(t=><button key={t.id} disabled={t.cloud} onClick={()=>!t.cloud&&onOpen(t)}>{t.title}{t.cloud&&<small>Em breve</small>}</button>)}</div>)}
    </div></div>
   </nav>
   <div className="nav-actions"><button className="icon-button" onClick={()=>setDark(!dark)} aria-label="Alternar tema">{dark?<Sun size={19}/>:<Moon size={19}/>}</button><button className="history-btn" onClick={onHistory}><History size={18}/> Histórico</button><button className="avatar">L</button><button className="mobile"><Menu/></button></div>
 </div></header>
}

function Welcome({onChoose}){
 return <main className="welcome-screen"><div className="welcome-glow welcome-glow-one"/><div className="welcome-glow welcome-glow-two"/><section className="welcome-content">
  <div className="welcome-brand"><span>PL</span><strong>STUDIO</strong></div>
  <div className="welcome-heading"><span className="eyebrow"><Sparkles/> Central de ferramentas</span><h1>Bem-vindo ao <em>PL Studio</em></h1><p>Escolha o produto que deseja usar agora. Seus arquivos são processados localmente no computador.</p></div>
  <div className="product-choice-grid">
   <button className="product-choice pdf-product" onClick={()=>onChoose('pdf')}><span className="product-choice-icon"><FileText/></span><span className="product-choice-copy"><small>DOCUMENTOS</small><strong>Editor PDF</strong><p>Converta, edite, organize, proteja e prepare seus arquivos PDF.</p><span className="product-features"><i><Check/> Conversão</i><i><Check/> Organização</i><i><Check/> OCR</i></span></span><span className="product-enter">Abrir Editor PDF <ArrowRight/></span></button>
   <button className="product-choice image-product" onClick={()=>onChoose('images')}><span className="product-choice-icon"><Images/></span><span className="product-choice-copy"><small>IMAGENS</small><strong>Editor de Imagens</strong><p>Converta, redimensione, otimize e prepare fotos para impressão.</p><span className="product-features"><i><Check/> Conversão em lote</i><i><Check/> Folha A4</i><i><Check/> Fotos 3x4</i></span></span><span className="product-enter">Abrir Editor de Imagens <ArrowRight/></span></button>
  </div>
  <footer className="welcome-footer"><ShieldCheck/> Processamento local e privado <span/> PL Studio 0.4</footer>
 </section>
 </main>
}

function PdfSidebar({onHome,onCategory,onImages,onHistory,dark,setDark}){
 return <aside className="product-sidebar"><div className="sidebar-mark" onClick={onHome}><span>PL</span></div><nav><button className="active" onClick={()=>{onCategory('Todas');scrollTo({top:0,behavior:'smooth'})}}><House/><span>Início</span></button><button onClick={()=>onCategory('Organizar')}><FileText/><span>PDF</span></button><button onClick={onImages}><Images/><span>Imagens</span></button><button onClick={()=>onCategory('Impressão')}><Printer/><span>Impressão</span></button><button onClick={onHistory}><History/><span>Histórico</span></button></nav><button className="sidebar-settings" onClick={()=>setDark(!dark)}><Settings/><span>{dark?'Tema claro':'Tema escuro'}</span></button></aside>
}

function Hero({onPick}){
 const input=useRef(); const [drag,setDrag]=useState(false);
 const take=(fs)=>{if(fs?.length) onPick(tools[0],Array.from(fs))};
 return <section className="hero"><div className="orb orb1"/><div className="orb orb2"/><div className="shell hero-inner">
   <div className="eyebrow"><Zap size={14} fill="currentColor"/> Rápido, seguro e gratuito</div>
   <h1>Documentos e imagens, <span>do seu jeito.</span></h1>
   <p>Converta, edite, organize e prepare impressões em um único programa para o seu dia a dia.</p>
   <div className={`dropzone ${drag?'drag':''}`} onDragOver={e=>{e.preventDefault();setDrag(true)}} onDragLeave={()=>setDrag(false)} onDrop={e=>{e.preventDefault();setDrag(false);take(e.dataTransfer.files)}}>
    <input ref={input} type="file" accept=".pdf" multiple hidden onChange={e=>take(e.target.files)}/>
    <div className="upload-icon"><UploadCloud size={29}/></div><div><strong>Arraste seus PDFs aqui</strong><small>ou selecione os arquivos no seu dispositivo</small></div>
    <button onClick={()=>input.current.click()}>Selecionar arquivos <ArrowRight size={17}/></button>
   </div>
   <div className="trust"><span><ShieldCheck/> Arquivos processados com segurança</span><span><Zap/> Processamento rápido</span><span><BadgeCheck/> Sem marcas d’água</span></div>
 </div></section>
}

function ToolCard({tool,onOpen,featured=false}){const Icon=tool.icon;return <button className={`tool-card ${featured?'featured-card':''} ${tool.cloud?'planned':''}`} onClick={()=>!tool.cloud&&onOpen(tool)} disabled={tool.cloud}>
 <span className={`tool-icon ${tool.tone}`}><Icon size={featured?25:22}/></span><span className="tool-copy"><strong>{tool.title}</strong><small>{tool.desc}</small></span>{tool.cloud&&<span className="coming-soon">Em breve</span>}<ChevronRight className="card-arrow" size={19}/>{featured&&!tool.cloud&&<span className="try">Usar agora <ArrowRight size={15}/></span>}
 </button>}

function QuickActions({files,onChoose,onClose}){
 const totalSize=files.reduce((sum,file)=>sum+file.size,0);
 const [pageCount,setPageCount]=useState(null);
 useEffect(()=>{let alive=true;if(files.length===1&&files[0].type==='application/pdf') (async()=>PDFDocument.load(await files[0].arrayBuffer()))().then(doc=>alive&&setPageCount(doc.getPageCount())).catch(()=>{});return()=>{alive=false}},[files]);
 const editor=tools.find(t=>t.id==='pdf-editor'),quick=tools.filter(t=>quickToolIds.includes(t.id)&&t.id!=='pdf-editor');
 const suggestions=files.length>1?[tools.find(t=>t.id==='merge'),editor,...quick]:[editor,...quick];
 return <div className="modal-backdrop quick-backdrop" onMouseDown={e=>e.target===e.currentTarget&&onClose()}><section className="quick-actions">
  <button className="close" onClick={onClose}><X/></button>
  <div className="quick-heading"><span className="selected-check"><Check/></span><div><span className="modal-kicker">Arquivo pronto</span><h2>O que você quer fazer?</h2><p>Escolha uma ferramenta para continuar com {files.length>1?'os arquivos selecionados':'o seu PDF'}.</p></div></div>
  <div className="selected-summary"><Files/><div><strong>{files.length===1?files[0].name:`${files.length} arquivos selecionados`}</strong><small>{files.length===1?`${formatBytes(totalSize)} · ${pageCount?`${pageCount} página${pageCount===1?'':'s'}`:'analisando páginas...'}`:`${formatBytes(totalSize)} no total`}</small></div><span><Check/> Carregado</span></div>
  <div className="quick-label">Ferramentas recomendadas</div>
  <div className="quick-grid">{suggestions.map(tool=>{const Icon=tool.icon;return <button key={tool.id} onClick={()=>onChoose(tool)}><span className={`tool-icon ${tool.tone}`}><Icon/></span><span><strong>{tool.title}</strong><small>{tool.desc}</small></span><ChevronRight/></button>})}</div>
  <button className="choose-other" onClick={()=>{onClose();setTimeout(()=>document.querySelector('#tools')?.scrollIntoView({behavior:'smooth'}),50)}}>Ver todas as ferramentas <ArrowRight/></button>
 </section></div>
}

function PageOrganizer({file,onClose,onDone}){
 const [pages,setPages]=useState([]),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[progress,setProgress]=useState(0),[dragged,setDragged]=useState(null),[result,setResult]=useState(null),[error,setError]=useState('');
 useEffect(()=>{let cancelled=false;(async()=>{try{const data=new Uint8Array(await file.arrayBuffer());const pdf=await pdfjs.getDocument({data}).promise;const loaded=[];for(let i=1;i<=pdf.numPages;i++){const page=await pdf.getPage(i);const viewport=page.getViewport({scale:.28});const canvas=document.createElement('canvas');const ctx=canvas.getContext('2d');canvas.width=viewport.width;canvas.height=viewport.height;await page.render({canvasContext:ctx,viewport}).promise;loaded.push({id:`${i}-${Date.now()}`,source:i-1,number:i,rotation:0,thumb:canvas.toDataURL('image/jpeg',.76)});if(!cancelled)setPages([...loaded]);}if(!cancelled)setLoading(false)}catch(e){if(!cancelled){setError('Não foi possível ler as páginas deste PDF.');setLoading(false)}}})();return()=>{cancelled=true}},[file]);
 const move=(from,to)=>{if(from===to)return;setPages(list=>{const next=[...list];const [item]=next.splice(from,1);next.splice(to,0,item);return next})};
 const rotate=id=>setPages(list=>list.map(p=>p.id===id?{...p,rotation:(p.rotation+90)%360}:p));
 const remove=id=>setPages(list=>list.filter(p=>p.id!==id));
 async function save(){if(!pages.length){setError('Mantenha pelo menos uma página no documento.');return}setBusy(true);setProgress(15);setError('');try{const source=await PDFDocument.load(await file.arrayBuffer());setProgress(40);const out=await PDFDocument.create();for(let i=0;i<pages.length;i++){const item=pages[i];const [page]=await out.copyPages(source,[item.source]);page.setRotation(degrees((page.getRotation().angle+item.rotation)%360));out.addPage(page);setProgress(40+Math.round((i+1)/pages.length*42));}const bytes=await out.save();setProgress(100);download(bytes,`${stem(file.name)}-organizado.pdf`);setResult({size:bytes.length});onDone(tools.find(t=>t.id==='organize'),[file],bytes.length)}catch(e){setError(e.message||'Não foi possível criar o PDF organizado.')}finally{setBusy(false)}}
 return <div className="organizer-shell"><header className="organizer-top"><div><button onClick={onClose}><ChevronLeft/></button><span className="brandmark brand-symbol"><img src="./brand/pdfly-symbol.png" alt=""/></span><div><strong>Organizar PDF</strong><small>{file.name}</small></div></div><div className="organizer-stats"><span>{pages.length} página{pages.length===1?'':'s'}</span><span>{formatBytes(file.size)}</span></div><button className="organizer-save" onClick={save} disabled={busy||loading}>{busy?`Processando ${progress}%`:'Aplicar e baixar'} <Download/></button></header>
  <main className="organizer-main"><div className="organizer-intro"><div><span className="section-tag">Editor de páginas</span><h2>Organize do seu jeito</h2><p>Arraste para reordenar, gire ou exclua páginas. O arquivo original não será alterado.</p></div><div className="organizer-legend"><span><GripVertical/> Arraste para mover</span><span><RotateCw/> Gire individualmente</span></div></div>
  {loading?<div className="pages-loading"><span className="spinner purple-spin"/><strong>Preparando miniaturas...</strong><small>{pages.length?`${pages.length} páginas carregadas`:'Lendo o documento'}</small></div>:<div className="page-grid">{pages.map((page,index)=><article className={`page-tile ${dragged===index?'dragging':''}`} draggable onDragStart={()=>setDragged(index)} onDragOver={e=>e.preventDefault()} onDrop={()=>{move(dragged,index);setDragged(null)}} onDragEnd={()=>setDragged(null)} key={page.id}><div className="page-preview"><img src={page.thumb} style={{transform:`rotate(${page.rotation}deg)`}}/><span className="page-order">{index+1}</span><div className="page-actions"><button title="Girar" onClick={()=>rotate(page.id)}><RotateCw/></button><button title="Excluir" onClick={()=>remove(page.id)}><Trash2/></button></div></div><footer><GripVertical/><span>Página {page.number}</span>{page.rotation!==0&&<em>{page.rotation}°</em>}</footer></article>)}</div>}
  {error&&<div className="organizer-message error"><CircleHelp/>{error}</div>}{result&&<div className="organizer-message success"><BadgeCheck/><div><strong>PDF organizado com sucesso!</strong><small>O download foi iniciado · novo tamanho: {formatBytes(result.size)}</small></div><button onClick={save}><Download/> Baixar novamente</button></div>}</main>
 </div>
}

const previewToolIds = new Set(['rotate','edit','sign','watermark','numbers']);

function PdfLivePreview({file,tool,rotation,mark,position,customText}){
 const [page,setPage]=useState(1),[total,setTotal]=useState(0),[image,setImage]=useState(''),[loading,setLoading]=useState(false),[previewError,setPreviewError]=useState('');
 const lastPageTool=tool.id==='edit'||tool.id==='sign';
 useEffect(()=>{setPage(1);setTotal(0);setImage('');setPreviewError('')},[file,tool.id]);
 useEffect(()=>{
  let cancelled=false,task;
  if(!file)return;
  setLoading(true);setPreviewError('');
  (async()=>{try{
   task=pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer())});
   const pdf=await task.promise;if(cancelled)return;
   const target=lastPageTool?pdf.numPages:Math.min(page,pdf.numPages);
   if(total!==pdf.numPages)setTotal(pdf.numPages);
   if(target!==page)setPage(target);
   const pdfPage=await pdf.getPage(target),viewport=pdfPage.getViewport({scale:1.15});
   const canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
   const context=canvas.getContext('2d',{alpha:false});context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);
   await pdfPage.render({canvasContext:context,viewport}).promise;
   if(!cancelled)setImage(canvas.toDataURL('image/jpeg',.9));
  }catch(e){if(!cancelled)setPreviewError(e.message||'Não foi possível gerar a pré-visualização.')}finally{if(!cancelled)setLoading(false)}})();
  return()=>{cancelled=true;try{task?.destroy()}catch{}};
 },[file,page,lastPageTool,total]);
 const overlayText=tool.id==='numbers'?`${page} / ${total}`:tool.id==='watermark'?mark:customText;
 return <section className="live-preview" aria-label="Pré-visualização do PDF">
  <header><div><Eye/><span><strong>Pré-visualização</strong><small>Veja o resultado antes de baixar</small></span></div>{total>1&&!lastPageTool&&<nav><button disabled={page<=1} onClick={()=>setPage(v=>Math.max(1,v-1))}><ChevronLeft/></button><span>{page} / {total}</span><button disabled={page>=total} onClick={()=>setPage(v=>Math.min(total,v+1))}><ChevronRight/></button></nav>}</header>
  <div className={`preview-stage ${tool.id==='rotate'?'rotation-stage':''}`}>
   {loading&&<div className="preview-loading"><span className="spinner purple-spin"/> Preparando página...</div>}
   {!loading&&previewError&&<div className="preview-failed"><CircleHelp/>{previewError}</div>}
   {!loading&&!previewError&&image&&<div className="preview-paper" style={tool.id==='rotate'?{transform:`rotate(${rotation}deg)`}:undefined}><img src={image} alt={`Página ${page}`}/>{tool.id!=='rotate'&&overlayText?.trim()&&<span className={`preview-overlay ${tool.id} ${position||'bottom'}`}>{overlayText}</span>}</div>}
  </div>
  <footer>{lastPageTool?`Exibindo a última página (${total||'...'})`:`Página ${page} de ${total||'...'}`}{tool.id==='rotate'&&<strong>Rotação: {rotation}°</strong>}</footer>
 </section>
}

function Workspace({tool,initialFiles,onClose,onDone}){
 const [files,setFiles]=useState(initialFiles||[]), [busy,setBusy]=useState(false), [error,setError]=useState(''),[progress,setProgress]=useState(0);
 const [range,setRange]=useState('1'), [rotation,setRotation]=useState('90'), [mark,setMark]=useState('CONFIDENCIAL'), [position,setPosition]=useState('bottom'), [quality,setQuality]=useState('balanced'), [imageScale,setImageScale]=useState('2'),[password,setPassword]=useState(''),[customText,setCustomText]=useState('');
 const input=useRef(); const Icon=tool.icon;
 useEffect(()=>setFiles(initialFiles||[]),[initialFiles,tool]);
 const add=(list)=>setFiles(v=>tool.multi?[...v,...Array.from(list)]:[Array.from(list)[0]]);
 const remove=i=>setFiles(v=>v.filter((_,x)=>x!==i));
 async function process(){
  if(tool.cloud){setError('Esta ferramenta estará disponível em uma próxima versão.');return}
  if(!files.length){input.current?.click();return}
  setBusy(true);setProgress(2);setError('');
  try{
   if(tool.id==='ocr'){const {createWorker,OEM}=await import('tesseract.js');const base=new URL('.',window.location.href);const worker=await createWorker('por',OEM.LSTM_ONLY,{workerPath:new URL('tesseract/worker.min.js',base).href,corePath:new URL('tesseract/tesseract-core-lstm.wasm.js',base).href,langPath:new URL('tessdata',base).href,gzip:true,logger:m=>{if(m.progress)setProgress(Math.max(5,Math.round(m.progress*85)))}});try{const source=await PDFDocument.load(await files[0].arrayBuffer());const font=await source.embedFont(StandardFonts.Helvetica);const renderPdf=await pdfjs.getDocument({data:new Uint8Array(await files[0].arrayBuffer())}).promise;for(let i=1;i<=renderPdf.numPages;i++){const page=await renderPdf.getPage(i);const viewport=page.getViewport({scale:2});const canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;const result=await worker.recognize(canvas);const clean=(result.data.text||'').replace(/[^\x20-\xFF\n]/g,' ').trim();if(clean){const pdfPage=source.getPage(i-1);const lines=clean.split(/\r?\n/).filter(Boolean).slice(0,120);let y=8;for(const line of lines){const safe=line.slice(0,180);try{pdfPage.drawText(safe,{x:5,y,size:3,font,color:rgb(1,1,1),opacity:.01});y+=3.5}catch{}}}setProgress(Math.round(i/renderPdf.numPages*95))}const bytes=await source.save();download(bytes,`${stem(files[0].name)}-ocr.pdf`);onDone(tool,files,bytes.length)}finally{await worker.terminate()}return;}
   if(tool.id==='html-pdf'){const source=await files[0].text();const parsed=new DOMParser().parseFromString(source,'text/html');const textContent=parsed.body?.innerText||parsed.body?.textContent||source;const bytes=await textPagesToPdf([textContent],stem(files[0].name));download(bytes,`${stem(files[0].name)}.pdf`);onDone(tool,files,bytes.byteLength);return;}
   if(tool.id==='word-pdf'){const mammoth=await import('mammoth/mammoth.browser.js');const result=await mammoth.extractRawText({arrayBuffer:await files[0].arrayBuffer()});const bytes=await textPagesToPdf([result.value],stem(files[0].name));download(bytes,`${stem(files[0].name)}.pdf`);onDone(tool,files,bytes.byteLength);return;}
   if(tool.id==='excel-pdf'){const {default:ExcelJS}=await import('exceljs/dist/exceljs.min.js');const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(await files[0].arrayBuffer());const pages=workbook.worksheets.map(sheet=>{const lines=[`PLANILHA: ${sheet.name}`,''];sheet.eachRow(row=>lines.push(row.values.slice(1).map(value=>value?.text||value?.result||value||'').join(' | ')));return lines});const bytes=await textPagesToPdf(pages,stem(files[0].name));download(bytes,`${stem(files[0].name)}.pdf`);onDone(tool,files,bytes.byteLength);return;}
   if(tool.id==='ppt-pdf'){const zip=await JSZip.loadAsync(await files[0].arrayBuffer());const slideFiles=Object.keys(zip.files).filter(name=>/^ppt\/slides\/slide\d+\.xml$/.test(name)).sort((a,b)=>Number(a.match(/\d+/)?.[0])-Number(b.match(/\d+/)?.[0]));const pages=[];for(const name of slideFiles){const xml=await zip.file(name).async('text');const docXml=new DOMParser().parseFromString(xml,'application/xml');pages.push(Array.from(docXml.getElementsByTagNameNS('*','t')).map(node=>node.textContent).filter(Boolean))}const bytes=await textPagesToPdf(pages,stem(files[0].name));download(bytes,`${stem(files[0].name)}.pdf`);onDone(tool,files,bytes.byteLength);return;}
   if(tool.id==='protect'){if(password.length<4)throw new Error('Use uma senha com pelo menos 4 caracteres.');const {PDFDocument:SecurePDFDocument}=await import('pdf-lib-plus-encrypt');const secured=await SecurePDFDocument.load(await files[0].arrayBuffer());await secured.encrypt({userPassword:password,ownerPassword:`${password}-pl-studio`,permissions:{printing:'lowResolution',modifying:false,copying:false}});const bytes=await secured.save();download(bytes,`${stem(files[0].name)}-protegido.pdf`);onDone(tool,files,bytes.length);return;}
   if(tool.id==='pdf-word'){const pages=await readPdfTextAndImages(files[0]);const {Document,Packer,Paragraph,PageBreak}=await import('docx');const children=[];pages.forEach((page,index)=>{page.lines.forEach(line=>children.push(new Paragraph(line)));if(index<pages.length-1)children.push(new Paragraph({children:[new PageBreak()]}))});const blob=await Packer.toBlob(new Document({sections:[{children}]}));download(blob,`${stem(files[0].name)}.docx`,'application/vnd.openxmlformats-officedocument.wordprocessingml.document');onDone(tool,files,blob.size);return;}
   if(tool.id==='pdf-ppt'){const pages=await readPdfTextAndImages(files[0],true);const blob=await imagesToPptx(pages.map(page=>page.image));download(blob,`${stem(files[0].name)}.pptx`,'application/vnd.openxmlformats-officedocument.presentationml.presentation');onDone(tool,files,blob.size);return;}
   if(tool.id==='pdf-excel'){const pages=await readPdfTextAndImages(files[0]);const {default:ExcelJS}=await import('exceljs/dist/exceljs.min.js');const workbook=new ExcelJS.Workbook();pages.forEach((page,index)=>{const sheet=workbook.addWorksheet(`Página ${index+1}`);const rows=page.lines.map(line=>line.split(/\s{2,}|\t/));(rows.length?rows:[['Página sem texto detectável']]).forEach(row=>sheet.addRow(row));sheet.columns.forEach(column=>{column.width=Math.min(45,Math.max(12,...column.values.map(value=>String(value||'').length+2)))})});const bytes=await workbook.xlsx.writeBuffer();download(bytes,`${stem(files[0].name)}.xlsx`,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');onDone(tool,files,bytes.byteLength);return;}
   if(tool.id==='pdf-jpg'){
    const images=[];
    for(let fileIndex=0;fileIndex<files.length;fileIndex++){const file=files[fileIndex];const data=new Uint8Array(await file.arrayBuffer());const pdf=await pdfjs.getDocument({data}).promise;const safeName=stem(file.name).replace(/[<>:"/\\|?*]+/g,'-').trim()||'documento';const prefix=files.length>1?`${String(fileIndex+1).padStart(2,'0')}-${safeName}`:safeName;for(let i=1;i<=pdf.numPages;i++){const page=await pdf.getPage(i);const viewport=page.getViewport({scale:Number(imageScale)});const canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);const ctx=canvas.getContext('2d',{alpha:false});ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);await page.render({canvasContext:ctx,viewport}).promise;const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Falha ao gerar a imagem.')),'image/jpeg',.9));images.push({blob,name:`${prefix}-pagina-${String(i).padStart(3,'0')}.jpg`})}}
    if(images.length===1){download(images[0].blob,images[0].name,'image/jpeg');onDone(tool,files,images[0].blob.size)}else{const zip=new JSZip();images.forEach(image=>zip.file(image.name,image.blob));const result=await zip.generateAsync({type:'blob'});download(result,'PL-Studio-imagens-JPG.zip','application/zip');onDone(tool,files,result.size)}return;
   }
   if(tool.id==='jpg-pdf'||tool.id==='scan'){
    const out=await PDFDocument.create();
    for(const f of files){const b=await f.arrayBuffer(); const img=f.type.includes('png')?await out.embedPng(b):await out.embedJpg(b); const max=842, scale=Math.min(1,max/img.height); const page=out.addPage([img.width*scale,img.height*scale]);page.drawImage(img,{x:0,y:0,width:page.getWidth(),height:page.getHeight()});}
    const bytes=await out.save();download(bytes,'imagens-convertidas.pdf');onDone(tool,files,bytes.length);return;
   }
   const docs=await Promise.all(files.map(async f=>PDFDocument.load(await f.arrayBuffer())));
   if(tool.id==='merge'){const out=await PDFDocument.create();for(const doc of docs){const pages=await out.copyPages(doc,doc.getPageIndices());pages.forEach(p=>out.addPage(p));}const b=await out.save();download(b,'pdfs-unidos.pdf');onDone(tool,files,b.length);return;}
   const doc=docs[0];
   if(tool.id==='repair'){const bytes=await doc.save({useObjectStreams:false,addDefaultPage:false});download(bytes,`${stem(files[0].name)}-reparado.pdf`);onDone(tool,files,bytes.length);return;}
   if(tool.id==='edit'||tool.id==='sign'){if(!customText.trim())throw new Error(tool.id==='sign'?'Digite o nome ou assinatura.':'Digite o texto da anotação.');const page=doc.getPages()[doc.getPageCount()-1];const font=await doc.embedFont(tool.id==='sign'?StandardFonts.TimesRomanItalic:StandardFonts.Helvetica);const size=tool.id==='sign'?28:14;page.drawText(customText.trim(),{x:42,y:42,size,font,color:tool.id==='sign'?rgb(.08,.12,.25):rgb(1,.2,.23),opacity:.9});const bytes=await doc.save();download(bytes,`${stem(files[0].name)}-${tool.id==='sign'?'assinado':'editado'}.pdf`);onDone(tool,files,bytes.length);return;}
   if(tool.id==='split'){
    const total=doc.getPageCount(); const chosen=range.trim()==='todas'?[...Array(total).keys()]:range.split(',').flatMap(part=>{const [a,b]=part.split('-').map(Number);return b?[...Array(b-a+1)].map((_,i)=>a+i-1):[a-1]}).filter(i=>i>=0&&i<total);
    const zip=new JSZip();for(const idx of chosen){const out=await PDFDocument.create();const [p]=await out.copyPages(doc,[idx]);out.addPage(p);zip.file(`pagina-${idx+1}.pdf`,await out.save());}const blob=await zip.generateAsync({type:'blob'});download(blob,`${stem(files[0].name)}-paginas.zip`,'application/zip');onDone(tool,files,blob.size);return;
   }
   if(tool.id==='organize'){const total=doc.getPageCount();const order=range.split(',').map(Number).filter(n=>n>0&&n<=total);if(!order.length)throw new Error('Informe a ordem das páginas, por exemplo: 3, 1, 2');const out=await PDFDocument.create();const pages=await out.copyPages(doc,order.map(n=>n-1));pages.forEach(p=>out.addPage(p));const b=await out.save();download(b,`${stem(files[0].name)}-organizado.pdf`);onDone(tool,files,b.length);return;}
   if(tool.id==='rotate') doc.getPages().forEach(p=>p.setRotation(degrees((p.getRotation().angle+Number(rotation))%360)));
   if(tool.id==='watermark'||tool.id==='numbers'){const font=await doc.embedFont(StandardFonts.HelveticaBold);const pages=doc.getPages();pages.forEach((p,i)=>{const label=tool.id==='numbers'?`${i+1} / ${pages.length}`:mark;const size=tool.id==='numbers'?10:Math.max(18,Math.min(54,p.getWidth()/label.length*1.5));const width=font.widthOfTextAtSize(label,size);let y=position==='top'?p.getHeight()-32:position==='center'?p.getHeight()/2:p.getHeight?24:24;p.drawText(label,{x:(p.getWidth()-width)/2,y,size,font,color:rgb(.42,.34,.88),opacity:tool.id==='watermark'?.22:.75,rotate:tool.id==='watermark'?degrees(-25):degrees(0)});});}
   const bytes=await doc.save({useObjectStreams:quality!=='max'});download(bytes,`${stem(files[0].name)}-${tool.id}.pdf`);onDone(tool,files,bytes.length);
  }catch(e){setError(e.message||'Não foi possível processar este arquivo.')}finally{setBusy(false)}
 }
 const showPreview=previewToolIds.has(tool.id)&&files.length===1&&(files[0]?.type==='application/pdf'||files[0]?.name?.toLowerCase().endsWith('.pdf'));
 return <div className="modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&onClose()}><section className={`workspace ${showPreview?'workspace-preview':''}`}>
  <button className="close" onClick={onClose}><X/></button><div className={`workspace-icon ${tool.tone}`}><Icon/></div><span className="modal-kicker">Ferramenta PDF</span><h2>{tool.title}</h2><p>{tool.desc}</p>
  <input ref={input} hidden type="file" accept={tool.accept} multiple={tool.multi} onChange={e=>add(e.target.files)}/>
  <button className="file-picker" onClick={()=>input.current.click()}><UploadCloud/><span><strong>{files.length?tool.multi?'Adicionar mais arquivos':'Trocar arquivo':'Selecionar arquivo'+(tool.multi?'s':'')}</strong><small>{tool.accept||'PDF'} · até 100 MB</small></span></button>
  {!!files.length&&<div className="file-list">{files.map((f,i)=><div className="file-row" key={f.name+i}><FileText/><span><strong>{f.name}</strong><small>{formatBytes(f.size)}</small></span><button onClick={()=>remove(i)}><Trash2/></button></div>)}</div>}
  {(tool.id==='split'||tool.id==='organize')&&<label className="field"><span>{tool.id==='split'?'Páginas (ex.: 1-3, 5 ou “todas”)':'Nova ordem (ex.: 3, 1, 2)'}</span><input value={range} onChange={e=>setRange(e.target.value)}/></label>}
  {tool.id==='rotate'&&<label className="field"><span>Rotação</span><select value={rotation} onChange={e=>setRotation(e.target.value)}><option value="90">90° à direita</option><option value="180">180°</option><option value="270">90° à esquerda</option></select></label>}
  {(tool.id==='watermark'||tool.id==='numbers')&&<div className="field-grid">{tool.id==='watermark'&&<label className="field"><span>Texto</span><input value={mark} onChange={e=>setMark(e.target.value)}/></label>}<label className="field"><span>Posição</span><select value={position} onChange={e=>setPosition(e.target.value)}><option value="bottom">Rodapé</option><option value="center">Centro</option><option value="top">Topo</option></select></label></div>}
  {tool.id==='compress'&&<label className="field"><span>Nível de compatibilidade</span><select value={quality} onChange={e=>setQuality(e.target.value)}><option value="balanced">Equilibrado</option><option value="max">Máxima compatibilidade</option></select><small>A compressão local otimiza a estrutura interna; PDFs com muitas imagens podem exigir compressão avançada no servidor.</small></label>}
  {tool.id==='pdf-jpg'&&<label className="field"><span>Qualidade das imagens</span><select value={imageScale} onChange={e=>setImageScale(e.target.value)}><option value="1.5">Boa · arquivo menor</option><option value="2">Alta · recomendada</option><option value="3">Máxima · arquivo maior</option></select><small>Você pode adicionar vários PDFs. Todas as páginas serão convertidas em JPG e reunidas em um único ZIP, sem subpastas.</small></label>}
  {(tool.id==='protect'||tool.id==='unlock')&&<label className="field"><span>{tool.id==='protect'?'Nova senha':'Senha atual'}</span><input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Digite a senha"/><small>{tool.id==='protect'?'A senha será exigida para abrir o documento.':'A senha é usada somente no dispositivo e não é armazenada.'}</small></label>}
  {(tool.id==='edit'||tool.id==='sign')&&<label className="field"><span>{tool.id==='sign'?'Nome ou assinatura visual':'Texto da anotação'}</span><input value={customText} onChange={e=>setCustomText(e.target.value)} placeholder={tool.id==='sign'?'Digite como deseja assinar':'Digite o texto a adicionar'}/><small>O conteúdo será inserido no rodapé da última página.</small></label>}
  {showPreview&&<PdfLivePreview file={files[0]} tool={tool} rotation={rotation} mark={mark} position={position} customText={customText}/>} 
  {error&&<div className="error"><CircleHelp/>{error}</div>}
  <button className="process" disabled={busy} onClick={process}>{busy?<><span className="spinner"/> {tool.id==='ocr'?`Reconhecendo ${progress}%`:'Processando...'}</>:<>{tool.cloud?'Continuar':'Processar e baixar'} <ArrowRight/></>}</button>
  <div className="privacy"><LockKeyhole/> Seus arquivos permanecem no dispositivo durante o processamento local.</div>
 </section></div>
}

function App(){
 const [product,setProduct]=useState(null),[dark,setDark]=useState(()=>localStorage.getItem('pl-studio-theme')==='dark'),[query,setQuery]=useState(''),[cat,setCat]=useState('Todas'),[active,setActive]=useState(null),[initial,setInitial]=useState([]),[quickFiles,setQuickFiles]=useState([]),[history,setHistory]=useState(()=>JSON.parse(localStorage.getItem('pl-studio-history')||localStorage.getItem('pdfly-history')||'[]')),[historyOpen,setHistoryOpen]=useState(false);
 useEffect(()=>{document.documentElement.dataset.theme=dark?'dark':'light';localStorage.setItem('pl-studio-theme',dark?'dark':'light')},[dark]);
 const filtered=useMemo(()=>tools.filter(t=>(cat==='Todas'||t.cat===cat)&&(`${t.title} ${t.desc}`.toLowerCase().includes(query.toLowerCase()))),[query,cat]);
 const open=(tool,files=[])=>{setActive(tool);setInitial(files)};
 const record=(tool,files,size)=>{const next=[{id:Date.now(),tool:tool.title,file:files.map(f=>f.name).join(', '),date:new Date().toLocaleString('pt-BR'),size},...history].slice(0,20);setHistory(next);localStorage.setItem('pl-studio-history',JSON.stringify(next))};
 const done=(tool,files,size)=>{record(tool,files,size);setTimeout(()=>setActive(null),350)};
 if(!product)return <Welcome onChoose={setProduct}/>;
 if(product==='images')return <ImageStudio mode="converter" onClose={()=>setProduct(null)} onDone={(count,size)=>record(tools.find(t=>t.id==='image-converter'),[{name:`${count} imagem(ns)`}],size||0)}/>;
 return <><div className="pdf-product-layout"><PdfSidebar onHome={()=>setProduct(null)} onCategory={value=>{setCat(value);setTimeout(()=>document.getElementById('tools')?.scrollIntoView({behavior:'smooth'}),50)}} onImages={()=>setProduct('images')} onHistory={()=>setHistoryOpen(true)} dark={dark} setDark={setDark}/><div className="pdf-product-content"><Header dark={dark} setDark={setDark} onHistory={()=>setHistoryOpen(true)} onOpen={open} onHome={()=>setProduct(null)}/><Hero onPick={(_,files)=>setQuickFiles(files)}/>
  <main>
   <section className="counter-shortcuts shell"><div><span className="section-tag">Atalhos do balcão</span><h2>Ações rápidas para o atendimento</h2></div><div>{[tools.find(t=>t.id==='pdf-editor'),tools.find(t=>t.id==='word-pdf'),tools.find(t=>t.id==='scan'),tools.find(t=>t.id==='pdf-jpg'),tools.find(t=>t.id==='merge')].map(t=>{const I=t.icon;return <button key={t.id} onClick={()=>open(t)}><span className={`mini-icon ${t.tone}`}><I/></span><strong>{t.title}</strong><ArrowRight/></button>})}</div></section>
   <section id="featured" className="section shell"><div className="section-head"><div><span className="section-tag">Comece por aqui</span><h2>Ferramentas mais usadas</h2><p>Tudo que você precisa para trabalhar com seus PDFs.</p></div></div><div className="featured-grid">{tools.filter(t=>featuredIds.includes(t.id)).map(t=><ToolCard key={t.id} tool={t} onOpen={open} featured/>)}</div></section>
   {history.length>0&&<section className="recent-section shell"><div className="section-head row"><div><span className="section-tag">Atividade recente</span><h2>Últimos trabalhos</h2></div><button onClick={()=>setHistoryOpen(true)}>Ver histórico <ArrowRight/></button></div><div className="recent-cards">{history.slice(0,4).map(item=><article key={item.id}><span><FileText/></span><div><strong>{item.tool}</strong><small>{item.file}</small><em>{item.date}</em></div><button onClick={()=>open(tools.find(t=>t.title===item.tool)||tools[0])}>Repetir</button></article>)}</div></section>}
   <section id="tools" className="section tools-section"><div className="shell"><div className="section-head row"><div><span className="section-tag">Caixa de ferramentas</span><h2>Todas as ferramentas</h2></div><div className="search"><Search/><input placeholder="Buscar ferramenta..." value={query} onChange={e=>setQuery(e.target.value)}/>{query&&<button onClick={()=>setQuery('')}><X/></button>}</div></div>
   <div className="chips">{categories.map(c=><button className={cat===c?'active':''} onClick={()=>setCat(c)} key={c}>{c}</button>)}</div>
   {cat==='Todas'&&!query?<div className="tool-groups">{categories.filter(c=>!['Todas','Imagens','Impressão'].includes(c)).map(group=><section key={group}><header><span>{group}</span><small>{tools.filter(t=>t.cat===group).length} ferramentas</small></header><div className="tools-grid">{tools.filter(t=>t.cat===group).map(t=><ToolCard key={t.id} tool={t} onOpen={open}/>)}</div></section>)}</div>:<div className="tools-grid">{filtered.map(t=><ToolCard key={t.id} tool={t} onOpen={open}/>)}</div>}{!filtered.length&&<div className="empty"><Search/><h3>Nenhuma ferramenta encontrada</h3><p>Tente buscar por outro termo.</p></div>}</div></section>
   <section id="security" className="security shell"><div><span className="security-icon"><ShieldCheck/></span><div><span className="section-tag">Privacidade em primeiro lugar</span><h2>Seus documentos são seus.</h2><p>As ferramentas compatíveis processam tudo localmente no navegador. Nenhum arquivo precisa sair do seu dispositivo.</p></div></div><div className="security-points"><span><Check/> Processamento local</span><span><Check/> Sem cadastro</span><span><Check/> Downloads imediatos</span></div></section>
  </main><footer><div className="shell"><a className="brand pl-brand"><span>PL</span><strong>STUDIO</strong></a><p>Ferramentas simples para documentos, imagens e impressão.</p><span>© 2026 PL Studio</span></div></footer></div></div>
  {active&&(active.id==='pdf-editor'?<PdfWorkbench initialFile={initial[0]} onClose={()=>setActive(null)} onDone={(file,size)=>record(active,[file],size)}/>:['image-converter','print-a4','photo-3x4'].includes(active.id)?<ImageStudio mode={active.id==='image-converter'?'converter':active.id==='print-a4'?'a4':'photo'} onClose={()=>setActive(null)} onDone={(count,size)=>record(active,[{name:`${count} imagem(ns)`}],size||0)}/>:active.id==='organize'&&initial[0]?<PageOrganizer file={initial[0]} onClose={()=>setActive(null)} onDone={record}/>:<Workspace tool={active} initialFiles={initial} onClose={()=>setActive(null)} onDone={done}/>)} 
  {!!quickFiles.length&&<QuickActions files={quickFiles} onClose={()=>setQuickFiles([])} onChoose={tool=>{const files=quickFiles;setQuickFiles([]);open(tool,files)}}/>}
  {historyOpen&&<div className="modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&setHistoryOpen(false)}><section className="workspace history-panel"><button className="close" onClick={()=>setHistoryOpen(false)}><X/></button><div className="workspace-icon blue"><History/></div><h2>Histórico local</h2><p>Conversões concluídas neste navegador.</p><button className="open-downloads" onClick={()=>window.plStudio?.openDownloads()}><FolderOpen/> Abrir pasta Downloads</button>{history.length?<div className="history-list">{history.map(h=><div key={h.id}><PackageCheck/><span><strong>{h.tool}</strong><small>{h.file} · {h.date}</small></span><em>{formatBytes(h.size)}</em><button onClick={()=>{setHistoryOpen(false);open(tools.find(t=>t.title===h.tool)||tools[0])}}>Repetir</button></div>)}</div>:<div className="empty"><History/><h3>Nenhuma conversão ainda</h3><p>Seus arquivos processados aparecerão aqui.</p></div>} {history.length>0&&<button className="clear-history" onClick={()=>{setHistory([]);localStorage.removeItem('pl-studio-history')}}><Trash2/> Limpar histórico</button>}</section></div>}
 </>;
}
createRoot(document.getElementById('root')).render(<App/>);
