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

- **`dashboard/index.html`** — a single-file **sandbox** copy of the admin
  dashboard (add clients, pause/resume, mark paid, view activity). Open it
  directly in a browser, no build step — use it to try changes fast.
- **`web/`** — the same dashboard as a **Next.js App Router app**. This is
  the real, ongoing version. See `web/README.md`.
- **`backend/google-apps-script/`** — the backend both of the above talk to:
  a Google Apps Script Web App backed by a Google Sheet acting as the
  database. No local server or install needed. See `SETUP.md` in that
  folder to deploy it and get a URL.

### Workflow for changes

Try a change in `dashboard/index.html` first (edit, refresh browser, done —
no build). Once it's right, ask Claude to port the same change into `web/`.
Keep both in sync going forward; don't let the HTML sandbox and the Next.js
app drift apart.

## Quick start

1. Follow `backend/google-apps-script/SETUP.md` to deploy the backend and get
   a Web App URL + admin key.
2. Open `dashboard/index.html` (or run `web/` with `npm install && npm run dev`)
   → Settings → paste the URL + admin key → Save & connect.
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
