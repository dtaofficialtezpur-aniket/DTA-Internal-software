// Starting books for the demo: chart of accounts, opening balances and sample day-to-day entries.
import { round2 } from './format.js';
import { balanceOf, defaultGroups, GST_RATES, L, taxLedgerId, voucherNo } from './accounts.js';
import { localDate } from './crmMeta.js';

export function addAccounts(db) {
  const first = db.invoices.map((i) => i.date).sort()[0];
  const booksFrom = (first || new Date().toISOString()).slice(0, 10);

  const led = (id, name, group, opening = 0, extra = {}) => ({ id, name, group, opening, ...extra });
  const ledgers = [
    led(L.cash, 'Cash', 'cash', 85000),
    led(L.bank, 'State Bank of India – Current A/c', 'bank', 1840000),
    led('l-capital', 'Capital – Abhimanyu Chhawchharia', 'capital', 0),
    led('l-drawings', 'Drawings', 'capital'),
    led('l-termloan', 'Term Loan – SBI', 'loans', -1000000),
    led('l-furniture', 'Furniture & Fixtures', 'fixed', 250000),
    led('l-computers', 'Computers & Peripherals', 'fixed', 120000),
    led('l-deposit', 'Security Deposit – Electricity', 'deposits', 100000),
    led(L.stock, 'Stock-in-hand', 'stock', round2(db.stockLedger.filter((m) => m.type === 'opening').reduce((s, m) => s + m.qty * (m.cost || 0), 0))),
    led(L.salesTmt, 'Sales – TMT Rebars', 'sales'), led(L.salesStr, 'Sales – Steel Structurals', 'sales'), led(L.salesAll, 'Sales – Allied Products', 'sales'),
    led(L.purchase, 'Purchases – Steel & Allied', 'purchase'),
    led(L.freight, 'Freight Inward', 'dexp'), led(L.loading, 'Loading & Unloading', 'dexp'), led(L.insurance, 'Insurance on Purchases', 'dexp'), led(L.other, 'Other Purchase Charges', 'dexp'),
    led('l-intinc', 'Interest Received', 'iincome'), led('l-discrec', 'Discount Received', 'iincome'),
    led('l-rent', 'Rent', 'iexp'), led('l-salary', 'Salaries & Wages', 'iexp'), led('l-elec', 'Electricity Charges', 'iexp'), led('l-tel', 'Telephone & Internet', 'iexp'),
    led('l-transport', 'Transport & Carriage Outward', 'iexp'), led('l-repairs', 'Repairs & Maintenance', 'iexp'), led('l-office', 'Office Expenses', 'iexp'),
    led('l-tea', 'Tea & Refreshments', 'iexp'), led('l-print', 'Printing & Stationery', 'iexp'), led('l-bankchg', 'Bank Charges', 'iexp'),
    led('l-interest', 'Interest on Loan', 'iexp'), led('l-dep', 'Depreciation', 'iexp'), led(L.roundoff, 'Round Off', 'iexp'), led(L.loyalty, 'Loyalty Points Redeemed', 'iexp'),
    led('l-tds', 'TDS Payable', 'duties'), led('l-gstpay', 'GST Payable', 'duties'),
  ];
  for (const r of GST_RATES) {
    for (const [kind, kn] of [['o', 'Output'], ['i', 'Input']]) {
      ledgers.push(led(taxLedgerId(kind, 'cgst', r / 2), `${kn} CGST @ ${r / 2}%`, 'duties'), led(taxLedgerId(kind, 'sgst', r / 2), `${kn} SGST @ ${r / 2}%`, 'duties'), led(taxLedgerId(kind, 'igst', r), `${kn} IGST @ ${r}%`, 'duties'));
    }
  }
  // Capital balances the opening trial balance (assets − other liabilities).
  const openings = { 'sup:s1': -650000 };
  const rest = ledgers.reduce((s, l) => s + l.opening, 0) + Object.values(openings).reduce((s, v) => s + v, 0);
  ledgers.find((l) => l.id === 'l-capital').opening = round2(-rest);

  db.acc = { booksFrom, groups: defaultGroups(), ledgers, openings, vouchers: [], seq: {} };

  // ----- sample daily entries (rent, salaries, deposits …) -----
  const today = localDate();
  let n = 0;
  const post = (type, date, lines, narration) => {
    if (date < booksFrom || date > today) return;
    db.acc.seq[type] = (db.acc.seq[type] || 0) + 1;
    db.acc.vouchers.push({ id: `v-seed-${++n}`, type, no: voucherNo(type, db.acc.seq[type]), date, lines: lines.map(([ledger, dr, cr]) => ({ ledger, dr, cr })), narration, createdBy: 'Accounts', createdAt: date + 'T10:00:00.000Z' });
  };
  const pay = (date, from, to, amt, text) => post('payment', date, [[to, amt, 0], [from, 0, amt]], text);
  const start = new Date(booksFrom + 'T00:00:00');
  const months = [];
  for (let d = new Date(start.getFullYear(), start.getMonth(), 1); d <= new Date(); d.setMonth(d.getMonth() + 1)) months.push([d.getFullYear(), d.getMonth()]);
  const ymd = (y, m, day) => localDate(new Date(y, m, day));
  const payroll = Object.values(db.hr?.profiles || {}).filter((p) => p.onPayroll).reduce((s, p) => s + p.salary, 0) || 106000;
  months.forEach(([y, m], i) => {
    pay(ymd(y, m, 5), L.bank, 'l-rent', 25000, 'Shop and godown rent');
    pay(ymd(y, m, 8), L.bank, 'l-interest', 8300, 'Interest on SBI term loan');
    pay(ymd(y, m, 12), L.bank, 'l-elec', 9800 + (i % 3) * 1700, 'Electricity bill');
    pay(ymd(y, m, 15), L.bank, 'l-tel', 1850, 'Broadband and mobile');
    pay(ymd(y, m, 20), L.cash, 'l-transport', 18500 + (i % 2) * 2500, 'Vehicle hire for deliveries');
    pay(ymd(y, m, 22), L.cash, 'l-tea', 2400, 'Tea and refreshments for staff and visitors');
    pay(ymd(y, m, 28), L.bank, 'l-salary', payroll, 'Staff salaries');
  });
  pay(ymd(start.getFullYear(), start.getMonth(), start.getDate() + 18), L.bank, 'sup:s1', 500000, 'Part payment to supplier');
  pay(ymd(start.getFullYear(), start.getMonth(), start.getDate() + 30), L.cash, 'l-drawings', 10000, 'Owner drawings');
  pay(ymd(start.getFullYear(), start.getMonth(), start.getDate() + 34), L.cash, 'l-repairs', 3200, 'Godown shed repairs');
  pay(ymd(start.getFullYear(), start.getMonth(), start.getDate() + 40), L.bank, 'l-bankchg', 590, 'Bank charges');
  post('journal', ymd(start.getFullYear(), start.getMonth() + 1, 28), [['l-dep', 3500, 0], ['l-furniture', 0, 2000], ['l-computers', 0, 1500]], 'Depreciation for the month');
  // Purchases from suppliers, sized so that opening stock + purchases − closing stock matches what was sold.
  const cost = new Map(db.products.map((p) => [p.id, p.cost]));
  const cogs = db.invoices.filter((i) => !i.cancelled).reduce((s, i) => s + i.items.reduce((a, l) => a + l.qty * l.factor * (cost.get(l.productId) || 0), 0), 0);
  const soldValue = {};
  for (const inv of db.invoices) if (!inv.cancelled) for (const l of inv.items) soldValue[l.productId] = (soldValue[l.productId] || 0) + l.qty * l.factor * (cost.get(l.productId) || 0);
  const closing = db.products.reduce((s, p) => s + p.stock * p.cost, 0);
  const need = Math.max(0, cogs - (ledgers.find((l) => l.id === L.stock).opening - closing));
  const span = Math.max(1, Math.round((new Date(today) - start) / 86400000));
  const k = 8;
  for (let i = 0; i < k; i++) {
    const date = localDate(new Date(start.getFullYear(), start.getMonth(), start.getDate() + 3 + Math.floor(i * (span - 6) / k)));
    const base = round2(need / k * (0.85 + (i % 4) * 0.1));
    const sup = i % 3 === 2 ? 's2' : 's1';
    const lines = [[L.purchase, base, 0]];
    let gross = base;
    if (sup === 's2') { const t = round2(base * 0.18); lines.push([taxLedgerId('i', 'igst', 18), t, 0]); gross += t; }
    else { const t = round2(base * 0.09); lines.push([taxLedgerId('i', 'cgst', 9), t, 0], [taxLedgerId('i', 'sgst', 9), t, 0]); gross += 2 * t; }
    gross = round2(gross);
    lines.push([`sup:${sup}`, 0, gross]);
    post('purchase', date, lines, `Steel purchase – bill ${sup.toUpperCase()}/${2600 + i}`);
    // The goods arrive in stock too, spread across the items that were sold.
    for (const [pid, sold] of Object.entries(soldValue)) {
      const p = db.products.find((x) => x.id === pid);
      if (p && p.cost) db.stockLedger.push({ id: `sl-seedpur-${i}-${pid}`, date: date + 'T09:00:00.000Z', productId: pid, qty: round2(base * (sold / cogs) / p.cost), type: 'purchase', ref: `Bill ${sup.toUpperCase()}/${2600 + i}`, cost: p.cost });
    }
    // Most bills are paid within three weeks.
    if (i < k - 2) pay(localDate(new Date(new Date(date).getTime() + 18 * 86400000)), L.bank, `sup:${sup}`, round2(gross * 0.9), 'Payment to supplier against bill');
  }
  // Weekly cash deposits keep the cash balance sensible.
  for (let d = new Date(start); d <= new Date(); d.setDate(d.getDate() + 1)) {
    if (d.getDay() !== 6) continue;
    const date = localDate(d);
    const cash = balanceOf(db, L.cash, date);
    const dep = Math.floor((cash - 60000) / 10000) * 10000;
    if (dep > 0) post('contra', date, [[L.bank, dep, 0], [L.cash, 0, dep]], 'Cash deposited in bank');
  }
}
