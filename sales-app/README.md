# DTA Sales

Standalone sales-team app: one sales employee per state logs leads and activity; the admin (holder of the portal key) sees everything.

- **Employees** (login ID + password given to them by the admin): add leads (software / application / website), move them through New → Contacted → Demo → Negotiation → Won/Lost, log calls/visits/meetings, set follow-ups, see their own totals.
- **Admin**: overview with leads, clients won, sales value and activity — by employee, by state and by product, filterable by date; full lead list and activity feed per employee; login times and last-active; create employee logins (ID + password), lock / unlock access at any time, set new passwords, edit, remove.
- **Monthly business**: clients won and business value per month, with year totals, a bar chart, a per-product split and a CSV download. Counted in the month a deal was marked Won. Calendar year or financial year (Apr–Mar). Employees see their own numbers; the admin sees everyone, can filter by employee, and gets a by-employee table.
- **Demo requests**: an employee asks the DTA team for a demo (from a lead, or for a new client) with product, online/on-site, preferred date and notes. It appears on the admin's **Demo requests** page with a red count badge in the sidebar. The admin schedules it (date/time + message), declines it, or marks it completed; the employee sees the status and message. Optional email alert: set `notify_email` in `config.php`.
- "Client" = a lead marked **Won** (with its deal value).

Layout: `desktop/` (Electron app employees install — see `desktop/README.md`), `backend/` (PHP + MySQL, see `backend/SETUP.md`) and `dashboard/` (React + Vite: `npm install && npm run dev`, `npm run build`). It uses the same stack and look as the main DTA dashboard so the two can be merged later.

## Preview mode (no backend needed)

`cd dashboard && npm install && npm run preview:dev` opens the app on sample data (switch between Admin and two employees on the login screen). Nothing is saved. `npm run build:preview` makes a static copy in `dist-preview/`. The normal `npm run build` contains none of this code.

## Backup on the admin's computer

Sales team page → **Backup to this computer** (admin only): Leads / Activity / Employees as Excel-friendly CSV, or one full JSON backup. The live data stays on the server so employees can work any time; this is your own copy. Passwords are never included.

## Single-file preview

`DTA-Sales-Preview.html` is the preview mode as one self-contained file you can double-click (sample data, nothing saved). Rebuild it with `cd dashboard && npm run build:single` and copy `dist-single/index.html` over it.
