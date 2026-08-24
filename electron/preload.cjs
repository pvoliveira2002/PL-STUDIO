const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('plStudio', {
  pathForFile: (file) => webUtils.getPathForFile(file),
  imagePreview: (filePath, options) => ipcRenderer.invoke('image:preview', filePath, options),
  chooseOutputFolder: () => ipcRenderer.invoke('image:choose-output'),
  convertImages: (payload) => ipcRenderer.invoke('image:convert', payload),
  openFolder: (folderPath) => ipcRenderer.invoke('image:open-folder', folderPath),
  openDownloads: () => ipcRenderer.invoke('app:open-downloads'),
});
