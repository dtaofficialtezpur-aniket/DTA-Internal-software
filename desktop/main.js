const { app, BrowserWindow, Menu, Notification, ipcMain, session, shell, safeStorage } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { autoUpdater } = require('electron-updater');

let mainWindow = null;
let updateReadyNotified = false;

function dashboardHtmlPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'dashboard', 'index.html')
    : path.join(__dirname, '..', 'dashboard', 'index.html');
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

  // The Backend URL is admin-supplied in Settings (Google Apps Script, a
  // self-hosted PHP backend, or anything else), so it can't be pinned to a
  // fixed list of hosts. Allow any HTTPS request (plus local files); block
  // everything else, including plain HTTP.
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    try {
      const url = new URL(details.url);
      if (url.protocol === 'file:' || url.protocol === 'https:') return callback({ cancel: false });
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

/**
 * The Backend URL, encrypted at rest with the OS's own secure storage
 * (Keychain on macOS, Credential Manager on Windows, libsecret on Linux)
 * via Electron's safeStorage, instead of the plain-text localStorage the
 * browser-opened dashboard/index.html falls back to. There's no admin key
 * anymore — the dashboard has its own login (username + PIN) handled
 * entirely by the backend; login session tokens are kept in the
 * renderer's memory only and never written here. Falls back to an
 * unencrypted file only on the rare system where no OS keychain is
 * available at all (safeStorage.isEncryptionAvailable() === false).
 */
function credentialsFilePath() {
  return path.join(app.getPath('userData'), 'credentials.dat');
}

ipcMain.handle('get-credentials', () => {
  try {
    const filePath = credentialsFilePath();
    if (!fs.existsSync(filePath)) return { backendUrl: '' };
    const raw = fs.readFileSync(filePath);
    const json = safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(raw) : raw.toString('utf8');
    const parsed = JSON.parse(json);
    return { backendUrl: parsed.backendUrl || '' };
  } catch (err) {
    console.error('Failed to read stored credentials:', err);
    return { backendUrl: '' };
  }
});

ipcMain.handle('set-credentials', (_event, creds) => {
  try {
    const json = JSON.stringify({ backendUrl: (creds && creds.backendUrl) || '' });
    const data = safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(json) : Buffer.from(json, 'utf8');
    fs.writeFileSync(credentialsFilePath(), data, { mode: 0o600 });
    return { ok: true };
  } catch (err) {
    console.error('Failed to save credentials:', err);
    return { ok: false, error: String(err) };
  }
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
