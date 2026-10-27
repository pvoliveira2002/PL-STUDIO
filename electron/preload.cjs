const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('plStudio', {
  pathForFile: (file) => webUtils.getPathForFile(file),
  imagePreview: (filePath, options) => ipcRenderer.invoke('image:preview', filePath, options),
  encodePrintJpeg: (imageBytes, density) => ipcRenderer.invoke('image:encode-print-jpeg', imageBytes, density),
  chooseOutputFolder: () => ipcRenderer.invoke('image:choose-output'),
  convertImages: (payload) => ipcRenderer.invoke('image:convert', payload),
  cancelImageConversion: (jobId) => ipcRenderer.invoke('image:cancel-conversion', jobId),
  onImageConversionProgress: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('image:conversion-progress', listener);
    return () => ipcRenderer.removeListener('image:conversion-progress', listener);
  },
  openFolder: (folderPath) => ipcRenderer.invoke('image:open-folder', folderPath),
  openDownloads: () => ipcRenderer.invoke('app:open-downloads'),
  removeBackground: (filePath, options) => ipcRenderer.invoke('background:remove', filePath, options),
  onBackgroundProgress: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('background:progress', listener);
    return () => ipcRenderer.removeListener('background:progress', listener);
  },
  getSrgbProfile: () => ipcRenderer.invoke('pdf:srgb-profile'),
  readPdfFile: (filePath) => ipcRenderer.invoke('pdf:read-file', filePath),
  pdfPasswordStatus: (filePath) => ipcRenderer.invoke('pdf:password-status', filePath),
  unlockPdf: (filePath, password) => ipcRenderer.invoke('pdf:unlock', filePath, password),
});
