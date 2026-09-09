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

The dashboard itself has real accounts: the first person to register becomes
the admin automatically; everyone after that registers as an employee and
sits pending until the admin approves them. Each person picks their own
6-digit PIN and logs in with it every time the app opens — no session is
kept between launches. The admin can remove someone's access at any time,
which takes effect immediately (their next action anywhere in the app kicks
them back to the login screen).

## Parts of this repo

- **`dashboard/index.html`** — the admin dashboard itself (login/register,
  add clients, pause/resume, mark paid, view activity, manage the team), as
  a single HTML file. Open it directly in a browser to try changes fast, no
  build step.
- **`desktop/`** — an Electron wrapper that packages `dashboard/index.html`
  as a real downloadable desktop app (Windows/Mac/Linux), with auto-update
  checking and hardened security settings. See `desktop/README.md`.
- **`backend/hostinger-php/`** — the backend: PHP + MySQL, built for
  Hostinger (or any PHP/MySQL) hosting. Handles both the client-software
  status check and the dashboard's accounts/clients/settings. See
  `SETUP.md` in that folder.

### Workflow for changes

Edit `dashboard/index.html` directly, refresh a browser tab to try it — no
build step. `desktop/` just packages that same file, so a change there is
picked up the next time the desktop app is built.

## Quick start

1. Follow `backend/hostinger-php/SETUP.md` to deploy the backend and get a
   Backend URL.
2. Open `dashboard/index.html` in a browser (or run the desktop app —
   `cd desktop && npm install && npm start`) → paste the Backend URL on the
   Connect screen → Register. The first account created becomes the admin.
3. Add a client from the dashboard, copy its Client ID + API key.
4. Send a status check yourself (from wherever you're testing) to:
   `<backend URL>?action=status&client_id=<id>&api_key=<key>`
5. From the dashboard, pause that client and re-check — the response should
   flip from `active` to `paused`. Resume it and it flips back.
6. To try the team flow: register a second account in a different browser
   session (or after logging out) — it'll sit pending until you approve it
   from the admin's **Team** page.

## Later

- Swap the PHP/MySQL backend for something else later if needed — the
  dashboard and client code only need their Backend URL changed, same
  contract either way.
- Wire the same status-check logic into the real client software once it's
  built (desktop app via Electron/Tauri, or a web app).
- Design pass on the desktop app's Update button, the new auth/Team screens,
  and packaged installer polish (icon, signing) — deferred for now to get a
  working build out.
