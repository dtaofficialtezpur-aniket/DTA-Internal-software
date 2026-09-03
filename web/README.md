# DTA Subscription Control — Next.js app

This is the same dashboard as `../dashboard/index.html`, ported to a Next.js
App Router project. Both talk to the same backend
(`../backend/google-apps-script/`) — same Backend URL, same admin key.

## Why two copies exist

`dashboard/index.html` is a single-file sandbox: open it, edit it, refresh
the browser — no build step. It's meant for trying out a change fast.

This app is the real one. The workflow going forward:
1. Try a change in `dashboard/index.html` first.
2. Once you're happy with it, ask Claude to port the same change here.

## Run it locally

```
npm install
npm run dev
```

Open http://localhost:3000, go to **Settings**, and connect it to the same
Backend URL + admin key you use in the HTML dashboard (each browser stores
this separately, in its own `localStorage`).

## Structure

- `app/page.tsx` — the whole dashboard (Overview, Clients, Activity Log,
  Settings, detail panel, add-client modal).
- `app/layout.tsx` / `app/globals.css` — shell and styling, ported from the
  HTML file's `<style>` block.
- `lib/backend.ts` — the one function (`apiCall`) that talks to the Apps
  Script backend; mirrors the HTML file's `apiCall`.
- `lib/format.ts`, `lib/types.ts` — small helpers/types.
