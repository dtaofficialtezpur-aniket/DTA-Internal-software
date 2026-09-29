// Runs in an isolated context (contextIsolation: true, sandbox: true) with
// no Node/Electron access of its own. This is the ONLY bridge between the
// renderer (dashboard/index.html) and the main process — keep it minimal.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isDesktop: true,
  platform: process.platform,
  // process.env.npm_package_version only exists when launched via `npm
  // start` -- a packaged app is double-clicked, not run through npm, so
  // that was always null in the real installed app. Ask the main process
  // instead, which always knows its own version (app.getVersion()).
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),

  // Fires once, when a downloaded update is ready to install.
  onUpdateReady: (callback) => {
    ipcRenderer.on('update-ready', (_event, info) => callback(info));
  },

  // Restarts the app and installs the already-downloaded update.
  installUpdate: () => ipcRenderer.send('install-update'),
});
