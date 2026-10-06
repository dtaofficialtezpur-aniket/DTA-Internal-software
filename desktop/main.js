const { app, BrowserWindow, Menu, Notification, ipcMain, session, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { autoUpdater } = require('electron-updater');

// Update checks fail silently to the user by design (no error dialog for a
// background check) -- but that also means there was no way to see WHY one
// failed. This writes every step to a plain text file so that can be read
// directly, without a dev console: <userData>/update.log (on Windows,
// %APPDATA%\dta-subscription-control\update.log).
function logUpdate(line) {
  try {
    const logPath = path.join(app.getPath('userData'), 'update.log');
    fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${line}\n`);
  } catch {
    // Nothing sensible to do if even the log write fails.
  }
}

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
    title: 'DTA Digital department',
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
  // if you change BACKEND_URL in the HTML, update ALLOWED_HOSTS to match.
  //
  // Also allowed: the auto-updater's own traffic. electron-updater's
  // ElectronHttpExecutor makes its requests through Electron's net module,
  // which is subject to this same session-level filter -- without these
  // hosts allowed, every update check gets silently cancelled here before
  // it ever reaches GitHub, no matter how correctly the release/token are
  // set up on the other end.
  const ALLOWED_HOSTS = ['dtaonline.in', 'api.github.com', 'github.com'];
  const ALLOWED_HOST_SUFFIXES = ['.githubusercontent.com'];
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    try {
      const url = new URL(details.url);
      if (url.protocol === 'file:') return callback({ cancel: false });
      if (url.protocol !== 'https:') return callback({ cancel: true });
      const allowed = ALLOWED_HOSTS.includes(url.hostname)
        || ALLOWED_HOST_SUFFIXES.some((suffix) => url.hostname.endsWith(suffix));
      callback({ cancel: !allowed });
    } catch {
      callback({ cancel: true });
    }
  });
}

function setUpAutoUpdates() {
  logUpdate(`app started, version=${app.getVersion()} isPackaged=${app.isPackaged}`);
  if (!app.isPackaged) {
    logUpdate('not packaged -- skipping update checks (no feed to check against in dev)');
    return;
  }

  // Repo is public, so no setFeedURL/token needed -- electron-builder
  // already baked the GitHub owner/repo into app-update.yml at build time
  // (from the "publish" block in package.json), and electron-updater reads
  // that automatically.
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false;

  autoUpdater.on('checking-for-update', () => logUpdate('checking for update...'));
  autoUpdater.on('update-available', (info) => logUpdate(`update available: ${info.version}`));
  autoUpdater.on('update-not-available', (info) => logUpdate(`no update available (latest is ${info.version})`));
  autoUpdater.on('download-progress', (p) => logUpdate(`downloading: ${Math.round(p.percent)}%`));

  autoUpdater.on('update-downloaded', (info) => {
    logUpdate(`update downloaded: ${info.version}`);
    if (mainWindow) mainWindow.webContents.send('update-ready', { version: info.version });

    if (!updateReadyNotified) {
      updateReadyNotified = true;
      if (Notification.isSupported()) {
        new Notification({
          title: 'Update available',
          body: `DTA Digital department ${info.version} is ready — click the Update button in the app to install.`,
        }).show();
      }
    }
  });

  autoUpdater.on('error', (err) => {
    logUpdate(`ERROR: ${err && err.stack ? err.stack : err}`);
    console.error('Auto-update check failed:', err);
  });

  const checkNow = () => autoUpdater.checkForUpdates().catch((err) => logUpdate(`ERROR (checkForUpdates threw): ${err && err.stack ? err.stack : err}`));
  checkNow();
  setInterval(checkNow, 6 * 60 * 60 * 1000); // re-check every 6 hours
}

ipcMain.on('install-update', () => {
  autoUpdater.quitAndInstall();
});

ipcMain.handle('get-app-version', () => app.getVersion());

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
