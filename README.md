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
the admin automatically (registration is closed after that). Employees
don't self-register — the admin creates their account (name + username)
from the Team page, and they set their own 6-digit PIN the first time they
log in with that username. Everyone logs in with their PIN every time the
app opens — no session is kept between launches. The admin can remove
someone's access at any time, which takes effect immediately (their next
action anywhere in the app kicks them back to the login screen).

The admin also has a **Files** page: create folders, upload files, and pick
which employees can see and download each one — an employee only ever sees
the files the admin has explicitly shared with them.

The Backend URL isn't something you type into the app — it's one constant
(`BACKEND_URL`) baked into `dashboard/index.html`, since this whole team
shares a single backend/database. Change that constant (and the matching
CSP `connect-src` value right above it) if you ever need to point at a
different backend.

## Parts of this repo

- **`dashboard/`** — the admin dashboard itself (login/register, add
  clients, pause/resume, mark paid, view activity, manage the team, file
  library): `index.html` (markup) + `styles.css` + `js/` (one file per
  feature area, loaded as plain ES modules — no build step, no
  framework). Open `index.html` directly in a browser to try changes
  fast.
- **`desktop/`** — an Electron wrapper that packages `dashboard/index.html`
  as a real downloadable desktop app (Windows/Mac/Linux), with auto-update
  checking and hardened security settings. See `desktop/README.md`.
- **`backend/hostinger-php/`** — the backend: PHP + MySQL, built for
  Hostinger (or any PHP/MySQL) hosting. Handles both the client-software
  status check and the dashboard's accounts/clients/settings. See
  `SETUP.md` in that folder.

### Workflow for changes

Edit files under `dashboard/` directly, refresh a browser tab to try it —
no build step (plain ES modules, no bundler). `desktop/` just packages the
whole `dashboard/` folder, so a change there is picked up the next time
the desktop app is built.

## Quick start

1. Follow `backend/hostinger-php/SETUP.md` to deploy the backend and get a
   Backend URL.
2. Set that URL as `BACKEND_URL` in `dashboard/index.html` (and update the
   CSP `connect-src` right above it to match your domain).
3. Open `dashboard/index.html` in a browser (or run the desktop app —
   `cd desktop && npm install && npm start`) → Register. The first account
   created becomes the admin.
4. Add a client from the dashboard, copy its Client ID + API key.
5. Send a status check yourself (from wherever you're testing) to:
   `<backend URL>?action=status&client_id=<id>&api_key=<key>`
6. From the dashboard, pause that client and re-check — the response should
   flip from `active` to `paused`. Resume it and it flips back.
7. To try the team flow: from the admin's **Team** page, add an employee
   (name + username, no PIN) — then log out and log in as them to see the
   first-login PIN-setup screen.

## Later

- Swap the PHP/MySQL backend for something else later if needed — the
  dashboard and client code only need their Backend URL changed, same
  contract either way.
- Wire the same status-check logic into the real client software once it's
  built (desktop app via Electron/Tauri, or a web app).
- Design pass on the desktop app's Update button, the new auth/Team screens,
  and packaged installer polish (icon, signing) — deferred for now to get a
  working build out.
