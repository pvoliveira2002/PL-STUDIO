export function isPdf(file){return Boolean(file?.name?.toLowerCase().endsWith('.pdf'))}

export async function preparePdfFile(file){
  if(!isPdf(file)||!window.plStudio?.pdfPasswordStatus)return file;
  const filePath=window.plStudio.pathForFile(file);
  if(!filePath)return file;
  const status=await window.plStudio.pdfPasswordStatus(filePath);
  if(!status.requiresPassword)return file;
  while(true){
    const password=window.prompt(`O arquivo "${file.name}" é protegido.\n\nDigite a senha para continuar:`);
    if(password===null)throw new Error('A abertura do PDF protegido foi cancelada.');
    if(!password)continue;
    try{
      const bytes=await window.plStudio.unlockPdf(filePath,password);
      return new File([bytes],file.name,{type:'application/pdf',lastModified:file.lastModified});
    }catch(error){
      if(String(error?.message||error).includes('PASSWORD_INCORRECT')){window.alert('Senha incorreta. Confira e tente novamente.');continue}
      throw error;
    }
  }
}

export async function preparePdfFiles(files){
  const prepared=[];
  for(const file of Array.from(files||[]))prepared.push(await preparePdfFile(file));
  return prepared;
}
