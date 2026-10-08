# DTA Sales

Standalone sales-team app: one sales employee per state logs leads and activity; the admin (holder of the portal key) sees everything.

- **Employees** (username + 6-digit PIN): add leads (software / application / website), move them through New → Contacted → Demo → Negotiation → Won/Lost, log calls/visits/meetings, set follow-ups, see their own totals.
- **Admin**: overview with leads, clients won, sales value and activity — by employee, by state and by product, filterable by date; full lead list and activity feed per employee; login times and last-active; add / edit / reset PIN / remove employees.
- "Client" = a lead marked **Won** (with its deal value).

Layout: `desktop/` (Electron app employees install — see `desktop/README.md`), `backend/` (PHP + MySQL, see `backend/SETUP.md`) and `dashboard/` (React + Vite: `npm install && npm run dev`, `npm run build`). It uses the same stack and look as the main DTA dashboard so the two can be merged later.
