const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('af', {
  getState: () => ipcRenderer.invoke('state:get'),
  setState: (patch) => ipcRenderer.invoke('state:set', patch),
  onState: (cb) => ipcRenderer.on('state:changed', (_e, s) => cb(s)),
  onOverlay: (cb) => ipcRenderer.on('overlay:update', (_e, d) => cb(d)),
  community: (method, route, body) => ipcRenderer.invoke('community:request', { method, route, body })
});
