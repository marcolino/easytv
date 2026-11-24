const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('easyTV', {
  getChannels: () => ipcRenderer.invoke('get-channels'),
  getAppInfo: () => ipcRenderer.invoke('get-app-info'),
  getPreferences: () => ipcRenderer.invoke('get-preferences'),
  savePreferences: data => ipcRenderer.invoke('save-preferences', data),
  openChannel: id => ipcRenderer.invoke('open-channel', id),
  requestPowerOff: () => ipcRenderer.invoke('request-power-off'),
  setSettingsScreenOpen: open => ipcRenderer.send('settings-screen-state', open),
  onMainFullscreenChanged: callback => {
    const listener = (_event, fullscreen) => callback(fullscreen);
    ipcRenderer.on('main-fullscreen-changed', listener);
    return () => ipcRenderer.removeListener('main-fullscreen-changed', listener);
  }
});
