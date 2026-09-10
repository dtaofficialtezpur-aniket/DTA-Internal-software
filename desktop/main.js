const { app, BrowserWindow, Menu, Notification, ipcMain, session, shell } = require('electron');
const path = require('node:path');
const { autoUpdater } = require('electron-updater');

let mainWindow = null;
let updateReadyNotified = false;

function dashboardHtmlPath() {
  // Always the built output (dashboard/dist/, produced by `npm run
  // build` in dashboard/) -- never the Vite source dashboard/index.html,
  // which just references /src/main.jsx and has nothing to render on
  // its own without the build step.
  return app.isPackaged
    ? path.join(process.resourcesPath, 'dashboard', 'index.html')
    : path.join(__dirname, '..', 'dashboard', 'dist', 'index.html');
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    title: 'DTA Subscription Control',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  // No default menu in production — fewer avenues to poke at internals.
  if (app.isPackaged) {
    Menu.setApplicationMenu(null);
  }

  mainWindow.loadFile(dashboardHtmlPath());

  // Keep the window strictly on its own local file — block any attempt to
  // navigate it elsewhere (e.g. a compromised/rogue script trying to load
  // a remote page in place of the dashboard).
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== mainWindow.webContents.getURL()) event.preventDefault();
  });

  // Never open new BrowserWindows from renderer content. Anything that
  // looks like a normal link opens in the user's real browser instead.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function lockDownSession() {
  // Deny every permission request (camera, mic, geolocation, notifications
  // from web content, etc.) — this app needs none of them.
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));

  // The dashboard has one fixed backend baked into dashboard/index.html
  // (BACKEND_URL) rather than a Settings field. Mirror that host here —
  // if you change BACKEND_URL in the HTML, update ALLOWED_HOST to match.
  const ALLOWED_HOST = 'dtaonline.in';
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    try {
      const url = new URL(details.url);
      if (url.protocol === 'file:') return callback({ cancel: false });
      if (url.protocol === 'https:' && url.hostname === ALLOWED_HOST) return callback({ cancel: false });
      callback({ cancel: true });
    } catch {
      callback({ cancel: true });
    }
  });
}

function setUpAutoUpdates() {
  if (!app.isPackaged) return; // no update feed to check against in dev

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false;

  autoUpdater.on('update-downloaded', (info) => {
    if (mainWindow) mainWindow.webContents.send('update-ready', { version: info.version });

    if (!updateReadyNotified) {
      updateReadyNotified = true;
      if (Notification.isSupported()) {
        new Notification({
          title: 'Update available',
          body: `DTA Subscription Control ${info.version} is ready — click the Update button in the app to install.`,
        }).show();
      }
    }
  });

  autoUpdater.on('error', (err) => {
    console.error('Auto-update check failed:', err);
  });

  const checkNow = () => autoUpdater.checkForUpdates().catch((err) => console.error(err));
  checkNow();
  setInterval(checkNow, 6 * 60 * 60 * 1000); // re-check every 6 hours
}

ipcMain.on('install-update', () => {
  autoUpdater.quitAndInstall();
});

app.whenReady().then(() => {
  lockDownSession();
  createWindow();
  setUpAutoUpdates();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Belt-and-suspenders: refuse any webContents this app creates permission
// to attach a new webview or navigate to a non-local, non-allowlisted URL.
app.on('web-contents-created', (_event, contents) => {
  contents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://')) event.preventDefault();
  });
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
});
