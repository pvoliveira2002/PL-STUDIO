const { app, BrowserWindow, shell, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const sharp = require('sharp');
const { pathToFileURL } = require('url');
const { execFile } = require('child_process');
const { Worker } = require('worker_threads');
const { runImageBatch } = require('./image-batch.cjs');

const imageInputExtensions = new Set(['.jpg','.jpeg','.png','.webp','.avif','.tif','.tiff','.bmp','.gif','.heic','.heif']);
const imageOutputExtensions = { jpeg:'.jpg',png:'.png',webp:'.webp',avif:'.avif',tiff:'.tiff' };
const backgroundInputFormats = new Set(['jpeg','png','webp','tiff']);
const maxInputFileSize = 100 * 1024 * 1024;

function validImagePath(filePath) {
  return typeof filePath === 'string' && path.isAbsolute(filePath) && imageInputExtensions.has(path.extname(filePath).toLowerCase());
}

function validPdfPath(filePath) {
  return typeof filePath === 'string' && path.isAbsolute(filePath) && path.extname(filePath).toLowerCase() === '.pdf';
}

async function prepareBackgroundInput(filePath) {
  if(typeof filePath!=='string'||!path.isAbsolute(filePath))throw new Error('Caminho da imagem inválido.');
  let stats;
  try{stats=await fsp.stat(filePath)}catch{throw new Error('A imagem selecionada não está mais disponível.')}
  if(!stats.isFile())throw new Error('O caminho selecionado não é um arquivo.');
  if(stats.size>maxInputFileSize)throw new Error('A imagem excede o limite de 100 MB.');
  try{
    const pipeline=sharp(filePath,{animated:false,failOn:'warning',limitInputPixels:268402689});
    const metadata=await pipeline.metadata();
    if(!backgroundInputFormats.has(metadata.format))throw new Error('UNSUPPORTED_FORMAT');
    return await pipeline.rotate().png().toBuffer();
  }catch(error){
    if(error?.message==='UNSUPPORTED_FORMAT')throw new Error('Formato não suportado. Use JPG, PNG, WebP ou TIFF.');
    throw new Error('Não foi possível ler esta imagem. O arquivo pode estar corrompido ou em um formato não suportado.');
  }
}

function runBackgroundRefinement(original, raw, options) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(path.join(__dirname, 'background-refine-worker.cjs'), {
      workerData: { original, raw, options },
    });
    worker.once('message', (message) => {
      if (message?.error) reject(new Error(message.error));
      else resolve(message);
    });
    worker.once('error', reject);
    worker.once('exit', (code) => {
      if (code !== 0) reject(new Error(`O refinamento foi encerrado com o código ${code}.`));
    });
  });
}

function qpdfPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'qpdf', 'qpdf.exe')
    : path.join(__dirname, '..', 'resources', 'qpdf', 'qpdf.exe');
}

function runQpdf(args) {
  return new Promise((resolve, reject) => execFile(qpdfPath(), args, { windowsHide:true, timeout:120000 }, (error, stdout, stderr) => {
    if (error && typeof error.code !== 'number') {
      reject(new Error(error.code === 'ETIMEDOUT' ? 'O QPDF excedeu o tempo limite.' : `Falha ao executar o QPDF: ${error.message}`));
      return;
    }
    resolve({ code:error?.code ?? 0, stdout:String(stdout||''), stderr:String(stderr||'') });
  }));
}

function registerPdfHandlers(){
  ipcMain.handle('pdf:read-file', async (_event, filePath) => {
    if(!validPdfPath(filePath))throw new Error('Arquivo PDF inválido.');
    let stats;
    try{stats=await fsp.stat(filePath)}catch{throw new Error('O PDF selecionado não está mais disponível. Se ele veio do WhatsApp, e-mail ou de uma pasta temporária, salve-o no computador e selecione novamente.')}
    if(!stats.isFile())throw new Error('O caminho selecionado não é um arquivo PDF.');
    if(stats.size>maxInputFileSize)throw new Error('O PDF excede o limite de 100 MB.');
    try{return new Uint8Array(await fsp.readFile(filePath))}catch{throw new Error('O Windows não permitiu ler este PDF. Feche o programa que está usando o arquivo ou salve uma cópia em outra pasta.')}
  });
  ipcMain.handle('pdf:srgb-profile', async () => {
    const colorFolder=path.join(process.env.WINDIR||'C:\\Windows','System32','spool','drivers','color');
    const candidates=['sRGB Color Space Profile.icm','ewsrgb.icm'];
    for(const name of candidates){
      try{return new Uint8Array(await fsp.readFile(path.join(colorFolder,name)))}catch{}
    }
    throw new Error('O perfil de cor sRGB do Windows não foi encontrado.');
  });
  ipcMain.handle('pdf:password-status', async (_event, filePath) => {
    if(!validPdfPath(filePath)) throw new Error('Arquivo PDF inválido.');
    const result=await runQpdf(['--requires-password',filePath]);
    if(result.code===0)return{requiresPassword:true};
    if(result.code===2||result.code===3)return{requiresPassword:false};
    throw new Error(result.stderr.trim()||'Não foi possível verificar a proteção do PDF.');
  });
  ipcMain.handle('pdf:unlock', async (_event, filePath, password) => {
    if(!validPdfPath(filePath)) throw new Error('Arquivo PDF inválido.');
    if(typeof password!=='string'||!password.length)throw new Error('PASSWORD_REQUIRED');
    const work=await fsp.mkdtemp(path.join(app.getPath('temp'),'pl-studio-pdf-'));
    const passwordFile=path.join(work,'senha.txt'),output=path.join(work,'documento.pdf');
    try{
      await fsp.writeFile(passwordFile,password,{encoding:'utf8',mode:0o600});
      const result=await runQpdf([`--password-file=${passwordFile}`,'--decrypt',filePath,output]);
      if(result.code!==0&&result.code!==3){
        const detail=`${result.stderr}\n${result.stdout}`.toLowerCase();
        if(detail.includes('invalid password'))throw new Error('PASSWORD_INCORRECT');
        throw new Error(result.stderr.trim()||'Não foi possível desbloquear o PDF.');
      }
      return new Uint8Array(await fsp.readFile(output));
    }finally{await fsp.rm(work,{recursive:true,force:true})}
  });
}

function imagePipeline(filePath, options={}) {
  let pipeline=sharp(filePath,{animated:false,failOn:'warning',limitInputPixels:268402689}).rotate();
  const normalizeDimension=(value)=>{const number=Number(value);return Number.isFinite(number)&&number>0?Math.max(1,Math.min(30000,Math.round(number))):null};
  const width=normalizeDimension(options.width);
  const height=normalizeDimension(options.height);
  if(width||height){
    const fit=['cover','contain','fill','inside'].includes(options.fit)?options.fit:'inside';
    pipeline=pipeline.resize({width,height,fit,withoutEnlargement:Boolean(options.withoutEnlargement),background:options.background||'#ffffff'});
  }
  return pipeline;
}

function outputPipeline(pipeline,format,quality,lossless){
  const q=Math.max(1,Math.min(100,Number(quality)||88));
  if(format==='jpeg')return pipeline.flatten({background:'#ffffff'}).jpeg({quality:q,mozjpeg:true,chromaSubsampling:'4:4:4'});
  if(format==='png')return pipeline.png({compressionLevel:9,quality:q});
  if(format==='webp')return pipeline.webp({quality:q,lossless:Boolean(lossless),effort:4});
  if(format==='avif')return pipeline.avif({quality:q,lossless:Boolean(lossless),effort:4});
  if(format==='tiff')return pipeline.tiff({quality:q,compression:'lzw'});
  throw new Error('Formato de saída inválido.');
}

async function availableOutput(folder,base,extension,overwrite){
  let candidate=path.join(folder,`${base}${extension}`);if(overwrite)return candidate;
  let index=1;while(true){try{await fsp.access(candidate);index+=1;candidate=path.join(folder,`${base} (${index})${extension}`)}catch{return candidate}}
}

function registerImageHandlers(){
  const allowedOutputFolders=new Set();
  const conversionJobs=new Map();
  const authorizeFolder=folderPath=>{const normalized=path.resolve(folderPath);allowedOutputFolders.add(normalized.toLowerCase());return normalized};
  ipcMain.handle('app:open-downloads',async()=>await shell.openPath(app.getPath('downloads'))==='');
  ipcMain.handle('image:choose-output',async()=>{const result=await dialog.showOpenDialog({properties:['openDirectory','createDirectory'],title:'Escolha a pasta de saída'});return result.canceled?'':authorizeFolder(result.filePaths[0])});
  ipcMain.handle('image:open-folder',async(_event,folderPath)=>{if(typeof folderPath!=='string'||!path.isAbsolute(folderPath))return false;const normalized=path.resolve(folderPath);if(!allowedOutputFolders.has(normalized.toLowerCase()))return false;try{if(!(await fsp.stat(normalized)).isDirectory())return false}catch{return false}return(await shell.openPath(normalized))===''});
  ipcMain.handle('image:preview',async(_event,filePath,options={})=>{if(!validImagePath(filePath))throw new Error('Arquivo de imagem inválido.');const original=await sharp(filePath).rotate().resize({width:720,height:480,fit:'inside',withoutEnlargement:true}).png().toBuffer();let result=imagePipeline(filePath,options);result=outputPipeline(result,options.format||'jpeg',options.quality,options.lossless);const processed=await result.toBuffer();const thumb=await sharp(processed).resize({width:720,height:480,fit:'inside',withoutEnlargement:true}).png().toBuffer();const metadata=await sharp(processed).metadata();return{original:`data:image/png;base64,${original.toString('base64')}`,result:`data:image/png;base64,${thumb.toString('base64')}`,size:processed.length,width:metadata.width,height:metadata.height}});
  ipcMain.handle('image:encode-print-jpeg',async(_event,imageBytes,density=300)=>{
    const input=Buffer.from(imageBytes||[]);
    if(!input.length||input.length>80*1024*1024)throw new Error('A folha preparada é inválida ou muito grande.');
    const dpi=Math.max(72,Math.min(600,Math.round(Number(density)||300)));
    const metadata=await sharp(input,{limitInputPixels:40000000}).metadata();
    if(metadata.width!==1748||metadata.height!==1240)throw new Error('As dimensões da folha A6 não correspondem a 148 × 105 mm em 300 DPI.');
    return new Uint8Array(await sharp(input).withMetadata({density:dpi}).jpeg({quality:95,mozjpeg:true,chromaSubsampling:'4:4:4'}).toBuffer());
  });
  ipcMain.handle('image:cancel-conversion',(event,jobId)=>{
    const job=conversionJobs.get(jobId);
    if(!job||job.senderId!==event.sender.id)return false;
    job.cancelled=true;
    return true;
  });
  ipcMain.handle('image:convert',async(event,payload={})=>{
    const files=Array.isArray(payload.files)?payload.files.filter(validImagePath):[];
    if(!files.length)throw new Error('Nenhuma imagem válida foi selecionada.');
    const options=payload.options||{},format=options.format||'jpeg',extension=imageOutputExtensions[format];
    if(!extension)throw new Error('Formato de saída inválido.');
    const jobId=typeof payload.jobId==='string'&&payload.jobId.length<=100?payload.jobId:`image-${Date.now()}`;
    if(conversionJobs.has(jobId))throw new Error('Já existe uma conversão com este identificador.');
    let outputFolder;
    if(payload.outputFolder){
      if(typeof payload.outputFolder!=='string'||!path.isAbsolute(payload.outputFolder))throw new Error('Pasta de saída inválida.');
      outputFolder=path.resolve(payload.outputFolder);
      if(!allowedOutputFolders.has(outputFolder.toLowerCase()))throw new Error('Selecione novamente a pasta de saída.');
    }else outputFolder=path.join(path.dirname(files[0]),'PL Studio - Convertidas');
    await fsp.mkdir(outputFolder,{recursive:true});
    authorizeFolder(outputFolder);
    const job={senderId:event.sender.id,cancelled:false};
    conversionJobs.set(jobId,job);
    const notify=payload=>{if(!event.sender.isDestroyed())event.sender.send('image:conversion-progress',{jobId,total:files.length,...payload,fileName:payload.file?.name||''})};
    try{
      const batch=await runImageBatch({
        files:files.map(filePath=>({filePath,name:path.basename(filePath)})),
        job,
        notify,
        convert:async({filePath})=>{
          const stats=await fsp.stat(filePath);
          if(!stats.isFile())throw new Error('O caminho não corresponde a um arquivo.');
          if(stats.size>maxInputFileSize)throw new Error('O arquivo excede o limite de 100 MB.');
          let pipeline=imagePipeline(filePath,options);
          if(options.keepMetadata)pipeline=pipeline.withMetadata();
          pipeline=outputPipeline(pipeline,format,options.quality,options.lossless);
          const suffix=String(options.suffix||'-convertida').replace(/[<>:"/\\|?*\x00-\x1F]/g,'-').slice(0,60);
          const base=`${path.basename(filePath,path.extname(filePath))}${suffix}`;
          const destination=await availableOutput(outputFolder,base,extension,Boolean(options.overwrite));
          await pipeline.toFile(destination);
          return destination;
        }
      });
      return{count:batch.results.length,files:batch.results,outputFolder,total:files.length,processed:batch.processed,failed:batch.failures.length,errors:batch.failures.slice(0,100),cancelled:batch.cancelled};
    }finally{
      conversionJobs.delete(jobId);
    }
  });
  ipcMain.handle('background:remove',async(event,filePath,options={})=>{
    const {removeBackground}=require('@imgly/background-removal-node');
    const packageRoot=app.isPackaged
      ?path.join(process.resourcesPath,'app.asar.unpacked','node_modules','@imgly','background-removal-node','dist')
      :path.join(__dirname,'..','node_modules','@imgly','background-removal-node','dist');
    const input=await prepareBackgroundInput(filePath);
    const source=new Blob([input],{type:'image/png'});
    const result=await removeBackground(source,{
      publicPath:`${pathToFileURL(packageRoot).href}/`,
      model:'medium',
      output:{format:'image/png',quality:1},
      progress:(key,current,total)=>event.sender.send('background:progress',{key,current,total})
    });
    const rawBuffer=Buffer.from(await result.arrayBuffer());
    event.sender.send('background:progress',{key:'refinement',current:0,total:1});
    const refined=await runBackgroundRefinement(input,rawBuffer,{
      edgeRefine:options.edgeRefine!==false,
      cleanupLevel:['off','conservative','strong'].includes(options.cleanup)
        ?{off:0,conservative:1,strong:2}[options.cleanup]
        :1,
      portraitCleanup:Boolean(options.portraitCleanup),
      decontaminate:Boolean(options.decontaminate)
    });
    event.sender.send('background:progress',{key:'refinement',current:1,total:1});
    // preserveDetails agora significa preservar o alpha contínuo produzido pelo
    // modelo. O preenchimento legado só é usado na comparação de desenvolvimento.
    const buffer=Buffer.from(refined.finalPng);
    const encode=value=>`data:image/png;base64,${Buffer.from(value).toString('base64')}`;
    return{
      dataUrl:encode(buffer),
      rawDataUrl:encode(rawBuffer),
      legacyDataUrl:encode(refined.legacyPng),
      originalNormalizedDataUrl:encode(input),
      originalMaskDataUrl:encode(refined.originalMaskPng),
      refinedMaskDataUrl:encode(refined.refinedMaskPng),
      size:buffer.length,
      width:refined.width,
      height:refined.height,
      refinement:{
        model:'medium',
        edgeRefine:options.edgeRefine!==false,
        cleanup:options.cleanup||'conservative',
        portraitCleanup:Boolean(options.portraitCleanup),
        decontaminate:Boolean(options.decontaminate),
        preserveDetailsMeaning:'Preserva alpha intermediário; não preenche buracos transparentes.'
      }
    };
  });
}

// Alguns computadores corporativos ou com drivers antigos mantêm o processo
// gráfico ativo, mas não conseguem criar a primeira janela do Chromium.
app.disableHardwareAcceleration();
// Contorna falhas STATUS_BREAKPOINT do sandbox gráfico em algumas ACLs do
// Windows. Mantemos o sandbox do renderizador e o Node.js desabilitado.
app.commandLine.appendSwitch('disable-gpu-sandbox');

const hasLock = app.requestSingleInstanceLock();
if (!hasLock) app.quit();

function createWindow() {
  const logPath = path.join(app.getPath('userData'), 'inicializacao.log');
  const log = (message) => {
    try { fs.appendFileSync(logPath, `${new Date().toISOString()} ${message}\n`); } catch {}
  };
  log(`Iniciando em ${process.platform} ${process.arch} | ${process.getSystemVersion()}`);

  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 900,
    minHeight: 650,
    show: true,
    backgroundColor: '#fbfbfe',
    title: 'PL Studio',
    icon: path.join(__dirname, '..', 'dist', 'brand', 'pdfly-symbol.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const interfacePath = path.join(__dirname, '..', 'dist', 'index.html');
  log(`Carregando ${interfacePath}`);
  win.webContents.on('did-fail-load', (_event, code, description) => {
    log(`did-fail-load ${code}: ${description}`);
    dialog.showErrorBox(
      'Não foi possível abrir o PL Studio',
      `Falha ao carregar a interface (${code}): ${description}. Reinstale o aplicativo ou contate o suporte.`,
    );
  });
  win.webContents.on('did-finish-load', () => log('Interface carregada com sucesso'));
  win.webContents.on('render-process-gone', (_event, details) => {
    log(`Renderizador encerrado: ${details.reason} (${details.exitCode})`);
    dialog.showErrorBox(
      'O PL Studio encontrou um problema',
      `O processo da interface foi encerrado (${details.reason}). O diagnóstico foi salvo em:\n${logPath}`,
    );
  });
  win.loadFile(interfacePath).catch((error) => {
    log(`loadFile rejeitado: ${error.stack || error.message}`);
    dialog.showErrorBox('Erro ao iniciar o PL Studio', `${error.message}\n\nDiagnóstico: ${logPath}`);
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });
}

app.whenReady().then(() => {
  registerImageHandlers();
  registerPdfHandlers();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('child-process-gone', (_event, details) => {
  try {
    const logPath = path.join(app.getPath('userData'), 'inicializacao.log');
    fs.appendFileSync(logPath, `${new Date().toISOString()} Processo auxiliar encerrado: ${details.type} | ${details.reason} (${details.exitCode})\n`);
  } catch {}
});

app.on('second-instance', () => {
  const win = BrowserWindow.getAllWindows()[0];
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
