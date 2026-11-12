# Shanti Trading Company — ERP & CRM (v0.7, demo by DTA)

Business software for Shanti Trading Company, Parua, Tezpur (steel structurals,
TMT rebars and allied products), built from the client's requirements
questionnaire (`../ERP_Client_Requirements_Questionnaire.docx`).

React 18 + Vite, no UI framework: about 100 KB of JavaScript (gzipped), IBM Plex
Sans / Serif bundled locally, light theme, CSS animations that switch off when
the user's system asks for reduced motion.

## Run it

```bash
cd erp
npm install
npm run dev        # http://localhost:5173
npm run build      # static site in dist/
```

Demo logins (username / PIN). Change them under **Users & Roles** before go-live:

| User | Role | PIN |
|---|---|---|
| abhimanyu | Owner | 1111 |
| salesmgr | Sales Manager | 2222 |
| cashier | Cashier / Billing | 3333 |
| godown | Godown / Warehouse | 4444 |
| accounts | Accounts | 5555 |
| salesman | Salesman | 6666 |
| security | Security | 7777 |

The system starts with two months of fictional sample sales so every screen has
something to show. **Settings → Reset demo** reloads it.

## Important before go-live: data storage

v0.1 keeps all data in the browser's local storage, so **each device has its own
separate copy** and nothing is shared between users yet. That is fine for
demonstrating and agreeing on the workflows. The client asked for cloud hosting,
so the next step is a cloud backend and database. All writes already go through
one function (`update` in `src/lib/store.jsx`), so the swap touches the data layer
only, not the screens. Real authentication (server-checked PINs, sessions) moves
to the backend at the same time.

## What is built (mapped to the requirements)

| Requirement | Where | Notes |
|---|---|---|
| POS with discount hierarchy | Point of Sale | Item, customer-group, offer and bill discounts; round-off. Manual discount above the user's tier limit (Settings) needs a Sales Manager / Owner PIN. |
| Session tracking | Point of Sale | Cashier shift: opening cash → closing count, expected vs counted, difference recorded. |
| Credit block + owner override | Point of Sale | Credit billing refused over limit or with any overdue invoice unless the owner overrides with PIN + reason. |
| Payment modes | Point of Sale | Cash, UPI, cheque, bank, credit (no card, as requested), split payments. |
| Payment links / UPI QR | POS, invoices, reminders | UPI QR on screen and on printed bills; UPI pay link inside WhatsApp reminders. Needs the shop's UPI ID in Settings. |
| Thermal + A5 GST bill | Invoices | 80 mm receipt and A5 tax invoice with HSN summary, CGST/SGST or IGST, amount in words. |
| Picklist generation | Warehouse Orders | Every bill creates a pick list → weigh → dispatch with vehicle → gate pass to security. Variance over ±2 % is flagged. |
| Customer hierarchy & groups | Customers | Parent / branch accounts; groups linked to a pricelist and automatic discount. |
| Pricelists (create/update/delete) | Pricelists & Offers | Per-item prices, bulk ± %, copy from another list, margin view. |
| Offers | Pricelists & Offers | Quantity-slab offers by item or category with validity dates; applied automatically at POS. |
| Payment reminders on ageing rules | Credit & Collections | Customers with overdue invoices come due for a reminder every N days (Settings); one click opens WhatsApp with the message and logs it. |
| Dynamic credit scoring | Customers, POS | 0–100 score from punctuality, limit use, overdue exposure and history; any overdue caps it below grade A. |
| Multi-unit inventory | Products & Units | Base stock unit plus any selling units (e.g. 1 pcs = 10.66 kg); kg, pcs, mtr, carton, box. |
| Low-stock alerts | Stock, Dashboard | Reorder level on every item. |
| ABC cycle count | Stock & Cycle Count | Daily list by ABC class and last count date; variance posted to stock and audit. |
| Purchase orders + owner approval | Purchase & Landed Cost | Draft → submit → owner approves with PIN → receive. |
| Landed cost | Purchase & Landed Cost | Freight, loading, unloading, insurance, other — spread by weight, value or quantity; shortage absorbed; weighted average cost updated. |
| Management dashboard | Management Dashboard | Sales, receivables, ageing, stock value, top items, items needing attention, live activity. |
| Security dashboard | Security Dashboard | Gate passes to verify, gate register, weight variances, failed logins, sensitive actions. |
| Reports | Reports & Analytics | Sales, KPIs, inventory movement, ageing, collections, GST HSN summary, GSTR-1 B2B CSV. |
| Tally | Reports → GST & Tally | Sales vouchers exported as Tally XML for import. |
| Audit trail | Audit Trail | Every change logged with user and time; filter and CSV export; no edit or delete. |
| Employee self-service | My Portal | Every user: punch in/out, attendance with app login/logout times, leave and advance requests, salary slips. |
| HR & payroll | HR & Payroll | Attendance register, owner approves leave and advances, monthly payroll (loss of pay, paid leave, advance recovery), printable salary slips. |
| Leads | Leads & Loyalty | Pipeline (new → contacted → quoted → won/lost), follow-up dates and due list, activity notes, WhatsApp, convert won lead to customer. |
| Loyalty programme | Leads & Loyalty, POS | Points per ₹100 billed, Silver/Gold/Platinum tiers with faster earning, redemption at the counter, manual adjustments. |
| Auto bank reconciliation | Bank Reconciliation | Import bank CSV (common Indian formats); credits auto-matched to receipts and bank/UPI/cheque bill payments by amount, date and reference; manual match, create receipt, or categorise the rest. |
| Bill scan | Bill Scan | Photo or PDF of a supplier bill (or pasted text) → supplier, bill no., date, total and item lines (per-tonne rates converted to kg) → purchase order for owner approval. The OCR/PDF engine loads from a CDN on first use, so scanning needs internet. |
| Roles | Users & Roles | Owner, Sales Manager, Cashier, Salesman, Accounts, Godown, Delivery, Security, each seeing only their modules. |

## CRM (Zoho-style)

Modules: CRM Home, Leads, Contacts, Accounts, Deals, Forecasts, Campaigns, Tasks, Meetings and Calls. All of them are
generated from the field definitions in `src/lib/crmMeta.js`, so every module gets the same tools:

- **Views** – standard views (e.g. My Leads, Hot Leads, Closing This Month) plus saved custom views with criteria, sort and columns.
- **Filter panel** – system-defined filters (touched/untouched, created today, with open/overdue activities, with notes,
  converted) and filter-by-fields with operators per type (contains, is/isn't, ranges, today / this week / overdue …).
- **Sort**, **column chooser**, **quick filter** (all / mine / touched / untouched), **search**, pagination.
- **View types** – Table, Kanban (drag cards between columns; group by any picklist), Canvas cards, Calendar and Chart.
- **Bulk actions** – mass update, change owner, export (CSV), mass delete; row actions (edit, clone, add task, log call, WhatsApp, email).
- **Import** – CSV with column mapping; **Export** – all, view or selection.
- **Record page** – inline edit, deal stage path, notes, open/closed activities with quick add, related lists, timeline of
  every change, previous/next record, clone, delete, and **Convert lead** → account + contact + deal (+ billing customer).
- **Global search** and **quick create (+)** in the top bar.

## Accounting (Tally-style daily entry)

**Accounting** holds a double-entry set of books. `src/lib/accounts.js` is the engine, `src/pages/acc/` the screens.

- **Voucher Entry** – Contra (F4), Payment (F5), Receipt (F6), Journal (F7), Sales (F8), Purchase (F9), Credit Note (Ctrl+F8),
  Debit Note (Ctrl+F9). Enter moves to the next field, Ctrl+A accepts, Esc clears; ledger fields type-ahead with the current
  balance shown; Sales / Purchase vouchers add CGST + SGST or IGST by the party's state; the resulting Dr/Cr entry is shown before
  saving. A **day summary** beside the form shows the date's cash and bank opening, received, paid and closing, and the vouchers
  entered (edit or delete them there). Warns when cash or bank would go below zero.
- **Automatic postings** – POS bills (sales by category, output GST, round off, cash / bank / customer), customer receipts and
  goods receipts (purchase, input GST, freight) post to the books by themselves, so accounts always agree with billing.
  Customers and suppliers are ledgers under Sundry Debtors / Creditors.
- **Reports** – Day Book (filters, CSV, Tally XML), Ledger (running balance), Trial Balance (group tree: opening, debit, credit,
  closing), Profit & Loss (trading account + P&L, stock valued from the inventory), Balance Sheet (with tally check).
- **Masters** – chart of accounts: Tally's primary groups, ledgers with opening balances, user groups.
- **Gateway of Accounts** – Tally-like home with letter shortcuts, cash / bank / debtors / creditors and quick voucher buttons.
- Roles: owner and Accounts post and edit; every voucher change is in the Audit Trail. Demo limit: 2 new vouchers per type per login.
- Stock is not moved by accounting vouchers; use purchase orders and billing for inventory.

## Analytics (Zoho-style dashboards)

**Analytics** holds ready-made dashboards (Org Overview, Sales Performance, Credit & Collections, Inventory & Purchase,
CRM Pipeline) built from live data. Components: KPI tiles with change versus the previous period (month-to-date is
compared with the same days last month), gauge and target bar against a target, bar, column, line, donut, funnel and table.
Owners and sales managers can **Add Component** (with live preview), edit, reorder or remove components, **Create
Dashboard** (blank or a copy), rename, set the default, delete and export CSV. Every component has a "View data" table.
Metrics and datasets are defined in `src/lib/analytics.js`; charts are in `src/components/charts.jsx` (validated
categorical palette, thin rounded bars, hover tooltips).

**Month-wise and year-wise data:** Analytics has a **View** switch (As set / Month wise / Year wise) with month and year
pickers; every component then shows that month or year, compared with the previous one (yearly targets are scaled to a
month). The **Month-wise** and **Year-wise performance** tables (revenue with change, bills, steel sold, credit collected,
leads, deals won, totals, best period) are components you can add to any dashboard, and the Management Dashboard has the
same two views with a revenue chart. The sample data includes three earlier years of monthly totals (`db.history`, as if
imported from the old system); the metric functions add them to the live records, which start from `history.liveFrom`.

Icons are colour-coded (`src/lib/iconColors.js`): every menu item and section, each CRM module, view-type buttons, and
due dates as chips (red overdue, orange today, green upcoming, grey done).

## Attendance from the biometric punch machine

Staff punch on the fingerprint machine, so there is no punch button in the software. **My Portal** shows each person's
attendance (in/out, late marks, source) read-only. **HR & Payroll → Attendance** imports the machine's CSV export
(employee code + date/time per punch, or separate date and time columns): first punch of the day = in, last = out.
Each employee's machine code is set under **HR → Employees**. HR/owner can correct missed punches with a recorded
reason (kept in the audit trail). Payroll counts only days before today, since the machine is synced afterwards.
A direct connection to the machine (ADMS / push SDK) needs its make and model and arrives with the cloud version.

## Still to do

- Cloud backend and shared database (see above), then the mobile view of the management app.
- WhatsApp Business API for fully automatic messages (now: one-click WhatsApp with logging).
- Direct weigh-scale connection (needs scale model and connection type).
- Second warehouse location when it opens.

## Demo limits

This build is a demo: each kind of new record (bills, customers, products, purchase orders, receipts, leads, users,
leave and advance requests, bank imports, gate entries, stock adjustments…) can be created only **2 times per login** (the allowance refreshes at every sign-in).
Editing and viewing existing data is unlimited. The remaining count shows beside each add button, and a notice
appears when the limit is reached. Counters are kept in `demoUsage`, reset at login and survive Settings → Reset demo.
`DEMO_LIMIT` / `DEMO_KINDS` in `src/lib/store.jsx` control it; remove the `guard(...)` calls for the full version.

## Single-file build

`npm run build:single` writes `dist-single/index.html`: the whole app in one HTML file that opens with a double-click.

## Code layout

- `src/lib/calc.js` — business rules (pricing, GST, discount tiers, credit, ageing, scoring, landed cost, cycle count).
- `src/lib/ops.js` — multi-step writes (post invoice, receive payment, move stock).
- `src/lib/store.jsx` — state, persistence, audit logging, login.
- `src/lib/seed.js` — demo data. `src/lib/print.js` — printable documents.
- `src/pages/` — one file per screen. `src/components/` — layout and shared UI.


### Voucher entry (Tally style, v0.8)
The Voucher Entry screen follows Tally's keyboard-first sheet: voucher-type band with F4–F9 / Ctrl+F8 / Ctrl+F9 keys, `Account :` line with current balance, Particulars/Amount rows with a *List of Ledger Accounts* pop-up (arrows + Enter), Enter to move on, Ctrl+A to accept, Esc to clear, F2 date, Alt+C create ledger, Ctrl+D delete.
