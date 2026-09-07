# DTA Subscription Control — desktop app

Wraps `../dashboard/index.html` in Electron so it runs as a real desktop
app instead of a file you open in a browser. Same dashboard, same backend
contract — this is packaging only, not a rewrite.

## Run it locally (dev)

```
npm install
npm start
```

## Build a downloadable package

```
npm install
npm run dist:win     # Windows installer/portable
npm run dist:mac     # macOS .dmg (must be built on a Mac)
npm run dist:linux   # Linux AppImage
```

Output lands in `release/`. Building a Windows package on a Windows
machine (or a Mac for macOS) is required for a fully signed/installer
build — cross-building from Linux is possible but produces an unsigned
portable build only.

## Security notes

- `contextIsolation` on, `nodeIntegration` off, `sandbox` on. The only
  bridge to the renderer is `preload.js`, which exposes nothing but the
  update-ready event and an install-update trigger.
- All permission requests (camera, mic, geolocation, etc.) are denied.
- Network requests are restricted to the Google Apps Script hosts the
  dashboard actually talks to (`script.google.com`,
  `script.googleusercontent.com`) plus Google Fonts.
- Navigation and new-window creation from renderer content is blocked;
  external links open in the system browser instead.
- `dashboard/index.html` itself was hardened too: a CSP meta tag, and an
  `esc()` helper applied everywhere client-controlled text (client name,
  software name, activity notes) is inserted into the page, so a
  malicious value typed into a client record can't inject HTML/script.

## Auto-update

`electron-updater` checks GitHub Releases on this repo for new versions
(every 6 hours, plus once on launch) and downloads updates automatically
in the background. This part of the code is wired up but the in-app
"Update available" button UI is not built yet — that's a follow-up.
