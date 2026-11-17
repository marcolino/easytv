const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('easyTV', {
  getChannels: () => ipcRenderer.invoke('get-channels'),
  openChannel: channelId => ipcRenderer.invoke('open-channel', channelId),
  getAppInfo: () => ipcRenderer.invoke('get-app-info'),
  onMainFullscreenChanged: callback => {
    const listener = (_event, fullscreen) => callback(fullscreen);
    ipcRenderer.on('main-fullscreen-changed', listener);
    return () => ipcRenderer.removeListener('main-fullscreen-changed', listener);
  }
});
