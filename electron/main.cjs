const { app, BrowserWindow, shell, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const sharp = require('sharp');
const { pathToFileURL } = require('url');

const imageInputExtensions = new Set(['.jpg','.jpeg','.png','.webp','.avif','.tif','.tiff','.bmp','.gif','.heic','.heif']);
const imageOutputExtensions = { jpeg:'.jpg',png:'.png',webp:'.webp',avif:'.avif',tiff:'.tiff' };

function validImagePath(filePath) {
  return typeof filePath === 'string' && path.isAbsolute(filePath) && imageInputExtensions.has(path.extname(filePath).toLowerCase());
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
  ipcMain.handle('app:open-downloads',async()=>await shell.openPath(app.getPath('downloads'))==='');
  ipcMain.handle('image:choose-output',async()=>{const result=await dialog.showOpenDialog({properties:['openDirectory','createDirectory'],title:'Escolha a pasta de saída'});return result.canceled?'':result.filePaths[0]});
  ipcMain.handle('image:open-folder',async(_event,folderPath)=>typeof folderPath==='string'?(await shell.openPath(folderPath))==='':false);
  ipcMain.handle('image:preview',async(_event,filePath,options={})=>{if(!validImagePath(filePath))throw new Error('Arquivo de imagem inválido.');const original=await sharp(filePath).rotate().resize({width:720,height:480,fit:'inside',withoutEnlargement:true}).png().toBuffer();let result=imagePipeline(filePath,options);result=outputPipeline(result,options.format||'jpeg',options.quality,options.lossless);const processed=await result.toBuffer();const thumb=await sharp(processed).resize({width:720,height:480,fit:'inside',withoutEnlargement:true}).png().toBuffer();const metadata=await sharp(processed).metadata();return{original:`data:image/png;base64,${original.toString('base64')}`,result:`data:image/png;base64,${thumb.toString('base64')}`,size:processed.length,width:metadata.width,height:metadata.height}});
  ipcMain.handle('image:convert',async(_event,payload={})=>{const files=Array.isArray(payload.files)?payload.files.filter(validImagePath):[];if(!files.length)throw new Error('Nenhuma imagem válida foi selecionada.');const options=payload.options||{},format=options.format||'jpeg',extension=imageOutputExtensions[format];if(!extension)throw new Error('Formato de saída inválido.');const outputFolder=payload.outputFolder&&path.isAbsolute(payload.outputFolder)?payload.outputFolder:path.join(path.dirname(files[0]),'PL Studio - Convertidas');await fsp.mkdir(outputFolder,{recursive:true});const results=[];for(const filePath of files){let pipeline=imagePipeline(filePath,options);if(options.keepMetadata)pipeline=pipeline.withMetadata();pipeline=outputPipeline(pipeline,format,options.quality,options.lossless);const suffix=String(options.suffix||'-convertida').replace(/[<>:"/\\|?*\x00-\x1F]/g,'-').slice(0,60);const base=`${path.basename(filePath,path.extname(filePath))}${suffix}`;const destination=await availableOutput(outputFolder,base,extension,Boolean(options.overwrite));await pipeline.toFile(destination);results.push(destination)}return{count:results.length,files:results,outputFolder}});
  ipcMain.handle('background:remove',async(_event,filePath,options={})=>{
    if(!validImagePath(filePath))throw new Error('Arquivo de imagem inválido.');
    const {removeBackground}=require('@imgly/background-removal-node');
    const packageRoot=app.isPackaged
      ?path.join(process.resourcesPath,'app.asar.unpacked','node_modules','@imgly','background-removal-node','dist')
      :path.join(__dirname,'..','node_modules','@imgly','background-removal-node','dist');
    const input=await fsp.readFile(filePath);
    const extension=path.extname(filePath).toLowerCase();
    const mime=['.jpg','.jpeg'].includes(extension)?'image/jpeg':extension==='.webp'?'image/webp':extension==='.png'?'image/png':'application/octet-stream';
    const source=new Blob([input],{type:mime});
    const result=await removeBackground(source,{publicPath:`${pathToFileURL(packageRoot).href}/`,model:'medium',output:{format:'image/png',quality:1,type:'foreground'}});
    let buffer=Buffer.from(await result.arrayBuffer());
    if(options.preserveDetails!==false)buffer=await preserveSmallTransparentDetails(buffer);
    const finalMetadata=await sharp(buffer).metadata();
    return{dataUrl:`data:image/png;base64,${buffer.toString('base64')}`,size:buffer.length,width:finalMetadata.width,height:finalMetadata.height};
  });
}

async function preserveSmallTransparentDetails(pngBuffer){
  const {data,info}=await sharp(pngBuffer).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const {width,height,channels}=info,total=width*height,visited=new Uint8Array(total),queue=new Int32Array(total);
  const maxArea=Math.max(32,Math.round(total*0.0008));
  for(let start=0;start<total;start++){
    if(visited[start]||data[start*channels+3]>24)continue;
    let head=0,tail=0,touchesBorder=false;queue[tail++]=start;visited[start]=1;
    while(head<tail){const point=queue[head++],x=point%width,y=Math.floor(point/width);if(x===0||y===0||x===width-1||y===height-1)touchesBorder=true;for(const next of [point-1,point+1,point-width,point+width]){if(next<0||next>=total||visited[next])continue;const nx=next%width,ny=Math.floor(next/width);if(Math.abs(nx-x)+Math.abs(ny-y)!==1||data[next*channels+3]>24)continue;visited[next]=1;queue[tail++]=next}}
    if(!touchesBorder&&tail<=maxArea)for(let i=0;i<tail;i++)data[queue[i]*channels+3]=255;
  }
  return sharp(data,{raw:{width,height,channels}}).png({compressionLevel:9}).toBuffer();
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
