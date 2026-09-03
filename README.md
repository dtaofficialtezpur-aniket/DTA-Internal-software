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

- **`dashboard/index.html`** — the DTA-internal admin dashboard (add clients,
  pause/resume, mark paid, view activity). Open it directly in a browser.
- **`backend/google-apps-script/`** — the backend: a Google Apps Script Web
  App backed by a Google Sheet acting as the database. No local server or
  install needed. See `SETUP.md` in that folder to deploy it and get a URL.

## Quick start

1. Follow `backend/google-apps-script/SETUP.md` to deploy the backend and get
   a Web App URL + admin key.
2. Open `dashboard/index.html` → Settings → paste the URL + admin key →
   Save & connect.
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
