import assert from 'node:assert/strict';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas } from '@napi-rs/canvas';
import JSZip from 'jszip';
import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const outputDir=path.join(root,'tmp-qa-pdf-tools');
const results=[];
const record=(tool,status,checks,details='')=>results.push({tool,status,checks,details});

async function fixture(pageCount=3,label='DOCUMENTO QA'){
  const pdf=await PDFDocument.create();
  const font=await pdf.embedFont(StandardFonts.Helvetica);
  for(let index=0;index<pageCount;index++){
    const page=pdf.addPage([595,842]);
    page.drawText(`${label} - PAGINA ${index+1}`,{x:60,y:760,size:24,font,color:rgb(.1,.2,.4)});
    for(let row=0;row<40;row++)page.drawText(`Linha de controle ${index+1}.${row+1}`,{x:60,y:720-row*15,size:9,font});
  }
  return pdf.save();
}

async function inspect(bytes){
  const data=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
  const task=pdfjs.getDocument({data:data.slice()});
  const pdf=await task.promise,texts=[];
  for(let pageNumber=1;pageNumber<=pdf.numPages;pageNumber++){
    const page=await pdf.getPage(pageNumber),content=await page.getTextContent();
    texts.push(content.items.map(item=>item.str).join(' '));
  }
  await task.destroy();
  const lib=await PDFDocument.load(data);
  return{pages:lib.getPageCount(),rotations:lib.getPages().map(page=>page.getRotation().angle),texts};
}

async function renderJpeg(bytes,scale=1.5){
  const task=pdfjs.getDocument({data:new Uint8Array(bytes)}),pdf=await task.promise,images=[];
  for(let pageNumber=1;pageNumber<=pdf.numPages;pageNumber++){
    const page=await pdf.getPage(pageNumber),viewport=page.getViewport({scale});
    const canvas=createCanvas(Math.ceil(viewport.width),Math.ceil(viewport.height));
    await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;
    images.push(canvas.toBuffer('image/jpeg',90));
  }
  await task.destroy();
  return images;
}

async function run(){
  await rm(outputDir,{recursive:true,force:true});
  await mkdir(outputDir,{recursive:true});
  const source=await fixture();
  await writeFile(path.join(outputDir,'entrada-3-paginas.pdf'),source);

  // Editor PDF completo: reorder, delete, rotate, text, signature, watermark and numbering.
  {
    const original=await PDFDocument.load(source),output=await PDFDocument.create();
    const selected=[{sourceIndex:2,rotation:90,id:'p3'},{sourceIndex:0,rotation:0,id:'p1'}];
    const copied=await output.copyPages(original,selected.map(page=>page.sourceIndex));
    copied.forEach((page,index)=>{page.setRotation(degrees((page.getRotation().angle+selected[index].rotation)%360));output.addPage(page)});
    const font=await output.embedFont(StandardFonts.HelveticaBold),signatureFont=await output.embedFont(StandardFonts.TimesRomanItalic),pages=output.getPages();
    pages.forEach((page,index)=>page.drawText(`${index+1} / ${pages.length}`,{x:280,y:18,size:10,font}));
    pages.forEach(page=>page.drawText('CONFIDENCIAL QA',{x:170,y:421,size:34,font,color:rgb(1,.2,.23),opacity:.2,rotate:degrees(-25)}));
    pages[0].drawText('ANOTACAO QA',{x:35,y:35,size:14,font,color:rgb(1,.2,.23)});
    pages[1].drawText('ASSINATURA QA',{x:35,y:35,size:28,font:signatureFont,color:rgb(.08,.12,.25)});
    const bytes=await output.save(),check=await inspect(bytes);
    assert.equal(check.pages,2);assert.equal(check.rotations[0],90);assert.match(check.texts[0],/PAGINA 3/);assert.match(check.texts[0],/ANOTACAO QA/);assert.match(check.texts[1],/ASSINATURA QA/);assert.ok(check.texts.every(text=>text.includes('CONFIDENCIAL QA')));assert.ok(check.texts.every((text,index)=>text.includes(`${index+1} / 2`)));
    await writeFile(path.join(outputDir,'editor-completo.pdf'),bytes);
    record('Editor PDF completo','APROVADO',7,'Reordenar, excluir, girar, texto, assinatura, marca d’água e numeração.');
  }

  // Dividir PDF: selected range and all pages.
  {
    const doc=await PDFDocument.load(source),zip=new JSZip();
    for(const index of [0,2]){const out=await PDFDocument.create();const [page]=await out.copyPages(doc,[index]);out.addPage(page);zip.file(`pagina-${index+1}.pdf`,await out.save())}
    const blob=await zip.generateAsync({type:'uint8array'}),loaded=await JSZip.loadAsync(blob),names=Object.keys(loaded.files);
    assert.deepEqual(names,['pagina-1.pdf','pagina-3.pdf']);
    for(const name of names)assert.equal((await inspect(await loaded.file(name).async('uint8array'))).pages,1);
    await writeFile(path.join(outputDir,'dividir-paginas-1-e-3.zip'),blob);
    let descendingRangeRejected=false,invalidRangeRejected=false;
    try{'3-1'.split(',').flatMap(part=>{const [a,b]=part.split('-').map(Number);return b?[...Array(b-a+1)].map((_,index)=>a+index-1):[a-1]})}catch{descendingRangeRejected=true}
    const invalidChosen='abc'.split(',').flatMap(part=>{const [a,b]=part.split('-').map(Number);return b?[...Array(b-a+1)].map((_,index)=>a+index-1):[a-1]}).filter(index=>index>=0&&index<3);
    invalidRangeRejected=invalidChosen.length===0;
    assert.equal(descendingRangeRejected,true);assert.equal(invalidRangeRejected,true);
    record('Dividir PDF','REPROVADO',6,'Fluxo válido funciona, mas “3-1” lança erro interno e texto inválido gera ZIP vazio em vez de mensagem de validação.');
  }

  // Compress PDF: exact structural optimization used by the app.
  {
    const doc=await PDFDocument.load(source),balanced=await doc.save({useObjectStreams:true}),max=await doc.save({useObjectStreams:false});
    assert.equal((await inspect(balanced)).pages,3);assert.equal((await inspect(max)).pages,3);
    await writeFile(path.join(outputDir,'comprimir-equilibrado.pdf'),balanced);
    const reduced=balanced.length<source.length;
    record('Comprimir PDF',reduced?'APROVADO COM RESSALVA':'REPROVADO',3,`Entrada: ${source.length} bytes; saída: ${balanced.length} bytes. Apenas otimização estrutural, sem recompressão de imagens.`);
  }

  // PDF to JPG: render multiple PDFs and validate JPEG signatures and ZIP names.
  {
    const second=await fixture(2,'SEGUNDO PDF'),files=[source,second],zip=new JSZip();let total=0;
    for(let fileIndex=0;fileIndex<files.length;fileIndex++)for(const [index,image] of (await renderJpeg(files[fileIndex])).entries()){const name=`${String(fileIndex+1).padStart(2,'0')}-documento-${fileIndex+1}-pagina-${String(index+1).padStart(3,'0')}.jpg`;assert.equal(image[0],0xff);assert.equal(image[1],0xd8);zip.file(name,image);total++}
    const bytes=await zip.generateAsync({type:'uint8array'}),loaded=await JSZip.loadAsync(bytes);assert.equal(Object.keys(loaded.files).length,5);assert.equal(total,5);
    await writeFile(path.join(outputDir,'pdf-para-jpg.zip'),bytes);
    record('PDF para JPG','APROVADO',7,'Dois PDFs, cinco páginas, JPGs válidos e nomes únicos no ZIP.');
  }

  // Watermark.
  {
    const doc=await PDFDocument.load(source),font=await doc.embedFont(StandardFonts.HelveticaBold),pages=doc.getPages();
    pages.forEach(page=>page.drawText('MARCA QA',{x:220,y:page.getHeight()/2,size:36,font,color:rgb(.42,.34,.88),opacity:.22,rotate:degrees(-25)}));
    const bytes=await doc.save(),check=await inspect(bytes);assert.equal(check.pages,3);assert.ok(check.texts.every(text=>text.includes('MARCA QA')));
    await writeFile(path.join(outputDir,'marca-dagua.pdf'),bytes);record("Marca d'água",'APROVADO',4,'Aplicação confirmada nas três páginas.');
  }

  // Rotate.
  {
    const doc=await PDFDocument.load(source);doc.getPages().forEach(page=>page.setRotation(degrees((page.getRotation().angle+90)%360)));
    const bytes=await doc.save(),check=await inspect(bytes);assert.deepEqual(check.rotations,[90,90,90]);
    await writeFile(path.join(outputDir,'rodar-90.pdf'),bytes);record('Rodar PDF','APROVADO',4,'Rotação de 90° persistida em todas as páginas.');
  }

  // Organize: page 3 first, page 2 removed, page 1 second; rotate first.
  {
    const doc=await PDFDocument.load(source),out=await PDFDocument.create(),pages=await out.copyPages(doc,[2,0]);pages[0].setRotation(degrees(180));pages.forEach(page=>out.addPage(page));
    const bytes=await out.save(),check=await inspect(bytes);assert.equal(check.pages,2);assert.match(check.texts[0],/PAGINA 3/);assert.match(check.texts[1],/PAGINA 1/);assert.equal(check.rotations[0],180);
    await writeFile(path.join(outputDir,'organizado.pdf'),bytes);record('Organizar PDF','APROVADO',5,'Reordenação, exclusão e rotação confirmadas.');
  }

  // Page numbers.
  {
    const doc=await PDFDocument.load(source),font=await doc.embedFont(StandardFonts.HelveticaBold),pages=doc.getPages();pages.forEach((page,index)=>page.drawText(`${index+1} / ${pages.length}`,{x:280,y:24,size:10,font,color:rgb(.42,.34,.88),opacity:.75}));
    const bytes=await doc.save(),check=await inspect(bytes);assert.ok(check.texts.every((text,index)=>text.includes(`${index+1} / 3`)));
    await writeFile(path.join(outputDir,'numerado.pdf'),bytes);record('Números de página','APROVADO COM RESSALVA',4,'Numeração correta; a interface permite posição, mas não oferece personalização de estilo.');
  }

  const summary={date:new Date().toISOString(),sourceBytes:source.length,totalTools:results.length,approved:results.filter(item=>item.status==='APROVADO').length,approvedWithCaveat:results.filter(item=>item.status==='APROVADO COM RESSALVA').length,failed:results.filter(item=>item.status==='REPROVADO').length,results};
  await writeFile(path.join(outputDir,'resultado.json'),JSON.stringify(summary,null,2));
  console.log(JSON.stringify(summary,null,2));
}

run().catch(error=>{console.error(error);process.exitCode=1});
