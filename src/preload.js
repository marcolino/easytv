const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('easyTV', {
  findStationLogo: (station, kind, force) => ipcRenderer.invoke('find-station-logo', station, kind, force),
  currentDirectTV: () => ipcRenderer.invoke('current-direct-tv'),
  directTVWeb: () => ipcRenderer.invoke('direct-tv-web'),
  getI18n: () => ipcRenderer.invoke('get-i18n'),
  previewLanguage: language => ipcRenderer.send('preview-language', language),
  saveRadio: (input, id) => ipcRenderer.invoke('save-radio', input, id),
  deleteRadio: id => ipcRenderer.invoke('delete-radio', id),
  restoreRadio: token => ipcRenderer.invoke('restore-radio', token),
  getRadios: () => ipcRenderer.invoke('get-radios'),
  searchRadios: query => ipcRenderer.invoke('search-radios', query),
  addRadio: id => ipcRenderer.invoke('add-radio', id),
  openRadio: (id, preview = false) => ipcRenderer.invoke('open-radio', id, preview),
  currentRadio: () => ipcRenderer.invoke('current-radio'),
  radioHome: () => ipcRenderer.invoke('radio-home'),
  radioStep: direction => ipcRenderer.invoke('radio-step', direction),
  searchTVs: q => ipcRenderer.invoke('search-tvs', q),
  importTV: key => ipcRenderer.invoke('import-tv', key),
  saveTV: (input, id) => ipcRenderer.invoke('save-tv', input, id),
  previewTV: id => ipcRenderer.invoke('preview-tv', id),
  restoreTV: token => ipcRenderer.invoke('restore-tv', token),
  deleteTV: id => ipcRenderer.invoke('delete-tv', id),
  refreshEPG: () => ipcRenderer.invoke('epg-refresh'),
  getEPGStatus: () => ipcRenderer.invoke('epg-status'),
  getEPGNowNext: id => ipcRenderer.invoke('epg-now-next', id),
  getChannels: () => ipcRenderer.invoke('get-channels'),
  getAppInfo: () => ipcRenderer.invoke('get-app-info'),
  getPreferences: () => ipcRenderer.invoke('get-preferences'),
  savePreferences: data => ipcRenderer.invoke('save-preferences', data),
  openChannel: id => ipcRenderer.invoke('open-channel', id),
  exportConfiguration: () => ipcRenderer.invoke('export-configuration'),
  importConfiguration: () => ipcRenderer.invoke('import-configuration'),
  resetProfile: () => ipcRenderer.invoke('reset-profile'),
  requestPowerOff: () => ipcRenderer.invoke('request-power-off'),
  setSettingsScreenOpen: open => ipcRenderer.send('settings-screen-state', open),
  onSettingsShortcut: callback => ipcRenderer.on('settings-shortcut', () => callback()),
  onMainFullscreenChanged: callback => {
    const listener = (_event, fullscreen) => callback(fullscreen);
    ipcRenderer.on('main-fullscreen-changed', listener);
    return () => ipcRenderer.removeListener('main-fullscreen-changed', listener);
  }
});
