# DTA Subscription Control

Tracks which clients are running DTA-built software, and pauses/resumes their
access from one dashboard.

## How it works

Client software (online or offline) checks in with a backend whenever it has
internet: "can I run?" The backend answers `active` or `paused` based on what
a DTA admin has set. If offline, the client keeps running on its last known
answer for a grace period. DTA never calls into the client — the client
always initiates the check, so it works from behind any firewall/NAT with no
listener needed on the customer's machine.

## Parts of this repo

- **`dashboard/index.html`** — the admin dashboard itself (add clients,
  pause/resume, mark paid, view activity), as a single HTML file. Open it
  directly in a browser to try changes fast, no build step.
- **`desktop/`** — an Electron wrapper that packages `dashboard/index.html`
  as a real downloadable desktop app (Windows/Mac/Linux), with auto-update
  checking and hardened security settings. See `desktop/README.md`.
- **`backend/google-apps-script/`** — a backend option: a Google Apps
  Script Web App backed by a Google Sheet acting as the database. No local
  server or install needed. See `SETUP.md` in that folder to deploy it and
  get a URL.
- **`backend/hostinger-php/`** — a second backend option: a PHP + MySQL
  backend for Hostinger (or any PHP/MySQL) hosting. Same request/response
  contract as the Apps Script one, so the dashboard and desktop app work
  unchanged either way — pick one, or run both and only use one at a time.
  See `SETUP.md` in that folder.

### Workflow for changes

Edit `dashboard/index.html` directly, refresh a browser tab to try it — no
build step. `desktop/` just packages that same file, so a change there is
picked up the next time the desktop app is built.

## Quick start

1. Follow `backend/google-apps-script/SETUP.md` (Google Sheets) or
   `backend/hostinger-php/SETUP.md` (Hostinger) to deploy a backend and get
   a Backend URL + admin key.
2. Open `dashboard/index.html` in a browser (or run the desktop app —
   `cd desktop && npm install && npm start`) → Settings → paste the URL +
   admin key → Save & connect.
3. Add a client from the dashboard, copy its Client ID + API key.
4. Send a status check yourself (from wherever you're testing) to:
   `<backend URL>?action=status&client_id=<id>&api_key=<key>`
5. From the dashboard, pause that client and re-check — the response should
   flip from `active` to `paused`. Resume it and it flips back.

## Later

- Swap the Apps Script backend for a real hosted backend (Node/Postgres, etc.)
  once you have real traffic — the dashboard and client code only need their
  Backend URL changed.
- Wire the same status-check logic into the real client software once it's
  built (desktop app via Electron/Tauri, or a web app).
- Design pass on the desktop app's Update button and packaged installer
  polish (icon, signing) — deferred for now to get a working build out.
