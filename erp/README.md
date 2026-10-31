# Shanti Trading Company — ERP & CRM (v0.2, demo by DTA)

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

## Still to do

- Cloud backend and shared database (see above), then the mobile view of the management app.
- WhatsApp Business API for fully automatic messages (now: one-click WhatsApp with logging).
- Direct weigh-scale connection (needs scale model and connection type).
- Second warehouse location when it opens.

## Demo limits

This build is a demo: each kind of new record (bills, customers, products, purchase orders, receipts, leads, users,
leave and advance requests, bank imports, gate entries, stock adjustments…) can be created only **2 times**.
Editing and viewing existing data is unlimited. The remaining count shows beside each add button, and a notice
appears when the limit is reached. Counters are kept in `demoUsage` and survive Settings → Reset demo.
`DEMO_LIMIT` / `DEMO_KINDS` in `src/lib/store.jsx` control it; remove the `guard(...)` calls for the full version.

## Single-file build

`npm run build:single` writes `dist-single/index.html`: the whole app in one HTML file that opens with a double-click.

## Code layout

- `src/lib/calc.js` — business rules (pricing, GST, discount tiers, credit, ageing, scoring, landed cost, cycle count).
- `src/lib/ops.js` — multi-step writes (post invoice, receive payment, move stock).
- `src/lib/store.jsx` — state, persistence, audit logging, login.
- `src/lib/seed.js` — demo data. `src/lib/print.js` — printable documents.
- `src/pages/` — one file per screen. `src/components/` — layout and shared UI.
