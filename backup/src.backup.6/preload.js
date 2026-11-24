const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('easyTV', {
  getI18n: () => ipcRenderer.invoke('get-i18n'),
  previewLanguage: language => ipcRenderer.send('preview-language', language),
  getRadios: () => ipcRenderer.invoke('get-radios'),
  searchRadios: query => ipcRenderer.invoke('search-radios', query),
  addRadio: id => ipcRenderer.invoke('add-radio', id),
  openRadio: (id, preview = false) => ipcRenderer.invoke('open-radio', id, preview),
  currentRadio: () => ipcRenderer.invoke('current-radio'),
  radioHome: () => ipcRenderer.invoke('radio-home'),
  radioStep: direction => ipcRenderer.invoke('radio-step', direction),
  getChannels: () => ipcRenderer.invoke('get-channels'),
  getAppInfo: () => ipcRenderer.invoke('get-app-info'),
  getPreferences: () => ipcRenderer.invoke('get-preferences'),
  savePreferences: data => ipcRenderer.invoke('save-preferences', data),
  openChannel: id => ipcRenderer.invoke('open-channel', id),
  requestPowerOff: () => ipcRenderer.invoke('request-power-off'),
  setSettingsScreenOpen: open => ipcRenderer.send('settings-screen-state', open),
  onSettingsShortcut: callback => ipcRenderer.on('settings-shortcut', () => callback()),
  onMainFullscreenChanged: callback => {
    const listener = (_event, fullscreen) => callback(fullscreen);
    ipcRenderer.on('main-fullscreen-changed', listener);
    return () => ipcRenderer.removeListener('main-fullscreen-changed', listener);
  }
});
