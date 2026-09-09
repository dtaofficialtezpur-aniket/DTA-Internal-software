// Runs in an isolated context (contextIsolation: true, sandbox: true) with
// no Node/Electron access of its own. This is the ONLY bridge between the
// renderer (dashboard/index.html) and the main process — keep it minimal.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isDesktop: true,
  platform: process.platform,
  appVersion: process.env.npm_package_version || null,

  // Fires once, when a downloaded update is ready to install.
  onUpdateReady: (callback) => {
    ipcRenderer.on('update-ready', (_event, info) => callback(info));
  },

  // Restarts the app and installs the already-downloaded update.
  installUpdate: () => ipcRenderer.send('install-update'),

  // Backend URL, stored encrypted via the OS keychain instead of
  // plain-text localStorage. Resolves to { backendUrl }. Login (username +
  // PIN) is handled by the backend itself; the session token lives only
  // in the renderer's memory, never persisted here.
  getCredentials: () => ipcRenderer.invoke('get-credentials'),
  setCredentials: (creds) => ipcRenderer.invoke('set-credentials', creds),
});
