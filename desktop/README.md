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
  update-ready event and an install-update trigger — there's no credential
  storage here at all anymore.
- All permission requests (camera, mic, geolocation, etc.) are denied.
- Network requests are locked to the one backend host this build is
  configured for (`ALLOWED_HOST` in `main.js`), which must match
  `BACKEND_URL` in `dashboard/js/state.js` — update both together if that
  ever changes.
- Navigation and new-window creation from renderer content is blocked;
  external links open in the system browser instead.
- There's nothing to store on disk for login: the Backend URL is a fixed
  constant baked into `dashboard/js/state.js`, not something typed in and
  saved, and login (username + 6-digit PIN) is handled entirely by the
  backend — the session token it returns lives only in memory (`state.js`)
  for that run, never written anywhere.
- The dashboard itself was hardened too: a CSP meta tag in `index.html`
  (scripts load only from local files, no inline `<script>` left at all),
  and an `esc()` helper applied everywhere client-controlled text (client
  name, software name, activity notes, full names) is inserted into the
  page, so a malicious value typed into a client or account record can't
  inject HTML/script.

## Auto-update

`electron-updater` checks GitHub Releases on this repo for new versions
(every 6 hours, plus once on launch) and downloads updates automatically
in the background. Once a download finishes, a button appears at the
bottom of the sidebar ("Update available — restart to install") and a
one-time OS notification fires; clicking the button restarts the app and
installs it.
