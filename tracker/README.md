# DTA Client Data Tracker

A Next.js + Tailwind CSS **progressive web app** for tracking clients across DTA's three departments —
**Accounts**, **Digital Marketing** and **Trading** — with Tally-style books of accounts, a CRM, filing trackers and a
day / month / year activity dashboard.

* **Offline-first PWA** – installable, works with no internet once opened, updates itself when a new version is deployed.
* **No server, no sign-up** – all data is stored in the browser (`localStorage`) on the device. Nothing is uploaded.
* **Starts empty** – there is no sample data. Each department begins with only a `Cash` ledger.

## What's inside

| Area | Highlights |
| --- | --- |
| **Dashboard** | Day / Month / Year switch, income / expenses / profit, month-by-month and day-by-day drill-down, dated activity log |
| **CRM / Leads** | Pipeline board (drag between stages), follow-ups due, notes, one-click *Convert to client* |
| **Books of accounts** | Voucher entry (Contra, Payment, Receipt, Journal, Sales, Purchase; **F4–F9**, **Enter** to move, **Ctrl+Enter** to save), Day Book, Ledgers with statements, Trial Balance, Profit & Loss, Balance Sheet |
| **Accounts services** | GST (monthly GSTR-1 / GSTR-3B), ITR (yearly), TDS (challan + quarterly returns), PAN application, Provident Fund, ESI, Professional Tax, Accounting & Bookkeeping, Audit, Other |
| **Trading services** | Trade License, FSSAI License, Digital Signature (DSC) |
| **Digital Marketing** | Clients with service, monthly fee and pause / resume |
| **Everywhere** | Global search (`/`), Quick add, alerts for overdue filings / follow-ups, client portal preview, deleted-items bin, JSON backup & restore |

Each department keeps its **own books** (like a separate company in Tally); the department switch in the top bar changes which set you see.

## Getting started

```bash
cd tracker
npm install
npm run dev          # http://localhost:3000  (service worker is disabled in dev)
```

Production build + local preview (this is what you deploy):

```bash
npm run build        # next build  →  out/   +  generates out/sw.js (the service worker)
npm start            # serves out/ on http://localhost:3000
```

Other scripts: `npm run typecheck`, `npm test` (unit tests for the accounting / filing logic).

### Deploying

`next build` produces a plain static site in `out/` — upload it to any static host (Hostinger, Netlify, GitHub Pages, S3, …).
HTTPS is required for installing the app and for the service worker (`localhost` is exempt).

If the site is served from a sub-folder (e.g. `https://example.com/tracker/`), build with the base path set:

```bash
NEXT_PUBLIC_BASE_PATH=/tracker npm run build
```

## How the PWA works

* `src/app/manifest.ts` → `/manifest.webmanifest` (name, icons incl. a maskable icon, start URL, shortcuts).
* `scripts/build-sw.mjs` runs after `next build`: it lists every file in `out/` and writes `out/sw.js`, which precaches the whole app
  (≈260 files) under a cache name derived from their contents. Pages, route payloads and assets are served from the cache first and
  refreshed in the background.
* `src/components/Providers.tsx` registers the worker (production only), captures the install prompt (an **Install app** button appears in
  the sidebar), shows an **Offline** badge, and shows an **Update now** banner when a new version has been downloaded — the page is
  never reloaded under you mid-entry.
* Deploying a new version just means uploading the new `out/`; installed copies pick it up the next time they're opened online.

## Your data

* Stored in the browser under the key `dta-tracker-v1`. Clearing site data erases it, and it is **not shared between devices or browsers**.
* Use **Backup (JSON)** in the sidebar regularly and keep the file safe; **Restore** loads it back (it replaces current data).
  Backups from the earlier single-file HTML demo can be restored here too.
* Client login IDs / passwords are kept **in plain text** in browser storage so they can be copied into government portals. Treat the
  device accordingly (screen lock, disk encryption) and don't use this for credentials you can't afford to expose.
* Multi-user access, sync between devices and server-side storage are intentionally out of scope for this app.

## Project layout

```
src/app/                 Next.js App Router routes: /[dept]/{dashboard,crm,vouchers,daybook,ledgers,trial-balance,
                         profit-loss,balance-sheet,clients,deleted,portal} and /[dept]/services/[service]
src/components/          AppShell (sidebar, top bar, search, quick add, alerts), UI primitives, views/*
src/lib/                 Framework-free logic: types, constants, books (ledgers / vouchers / reports), filings,
                         periods, actions (all data changes + activity log), store (localStorage)
scripts/                 build-sw.mjs (service worker generator), serve-out.mjs (local static server)
tests/                   node:test unit tests (run with tsx)
public/                  logo + PWA icons
```
