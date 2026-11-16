const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('easyTV', {
  getChannels: () => ipcRenderer.invoke('get-channels'),
  openChannel: (channelId) => ipcRenderer.invoke('open-channel', channelId)
});
