// Double-entry accounting engine (Tally-style): groups, ledgers, vouchers and the reports built from them.
// Manual vouchers live in db.acc.vouchers. Bills, customer receipts and goods receipts post automatically
// ("auto vouchers", computed from the live records), so the books always agree with sales and purchases.
import { daysBetween, round2 } from './format.js';
import { localDate } from './crmMeta.js';

// ---------- chart of accounts ----------
// [id, name, parent, nature (A asset, L liability, I income, E expense), trading account?]
const G = [
  ['capital', 'Capital Account', null, 'L'], ['loans', 'Loans (Liability)', null, 'L'], ['curliab', 'Current Liabilities', null, 'L'],
  ['duties', 'Duties & Taxes', 'curliab', 'L'], ['creditors', 'Sundry Creditors', 'curliab', 'L'], ['provisions', 'Provisions', 'curliab', 'L'],
  ['fixed', 'Fixed Assets', null, 'A'], ['invest', 'Investments', null, 'A'], ['curassets', 'Current Assets', null, 'A'],
  ['bank', 'Bank Accounts', 'curassets', 'A'], ['cash', 'Cash-in-hand', 'curassets', 'A'], ['deposits', 'Deposits (Asset)', 'curassets', 'A'],
  ['advances', 'Loans & Advances (Asset)', 'curassets', 'A'], ['stock', 'Stock-in-hand', 'curassets', 'A'], ['debtors', 'Sundry Debtors', 'curassets', 'A'],
  ['sales', 'Sales Accounts', null, 'I', true], ['purchase', 'Purchase Accounts', null, 'E', true],
  ['dincome', 'Direct Incomes', null, 'I', true], ['dexp', 'Direct Expenses', null, 'E', true],
  ['iincome', 'Indirect Incomes', null, 'I'], ['iexp', 'Indirect Expenses', null, 'E'],
];
export const defaultGroups = () => G.map(([id, name, parent, nature, trading]) => ({ id, name, parent, nature, trading: !!trading, system: true }));

export const L = {
  cash: 'l-cash', bank: 'l-bank', roundoff: 'l-roundoff', loyalty: 'l-loyalty', purchase: 'l-purchase', stock: 'l-stock',
  salesTmt: 'l-sales-tmt', salesStr: 'l-sales-str', salesAll: 'l-sales-all',
  freight: 'l-freight', loading: 'l-loading', insurance: 'l-insurance', other: 'l-othercharge',
};
export const GST_RATES = [5, 12, 18, 28];
const salesLedgerId = (cat) => ({ 'TMT Rebars': L.salesTmt, 'Steel Structurals': L.salesStr }[cat] || L.salesAll);
export const taxLedgerId = (kind, tax, rate) => `l-${kind}-${tax}-${rate}`; // kind o = output, i = input; tax cgst | sgst | igst

// ---------- voucher types ----------
export const VTYPES = {
  contra: { label: 'Contra', key: 'F4', prefix: 'CV', color: '#6250d6', hint: 'Cash deposited to / withdrawn from bank, bank to bank' },
  payment: { label: 'Payment', key: 'F5', prefix: 'PV', color: '#e0483f', hint: 'Money paid out: expenses, suppliers, drawings' },
  receipt: { label: 'Receipt', key: 'F6', prefix: 'RV', color: '#2e9a52', hint: 'Money received: customers, income, capital' },
  journal: { label: 'Journal', key: 'F7', prefix: 'JV', color: '#1f8fd1', hint: 'Adjustments with no cash or bank, e.g. depreciation' },
  sales: { label: 'Sales', key: 'F8', prefix: 'SV', color: '#2a78d6', hint: 'Sale on account with GST' },
  purchase: { label: 'Purchase', key: 'F9', prefix: 'PU', color: '#c7791a', hint: 'Purchase on account with GST' },
  creditnote: { label: 'Credit Note', key: 'Ctrl+F8', prefix: 'CN', color: '#d9467a', hint: 'Sales return / reduction in a sale' },
  debitnote: { label: 'Debit Note', key: 'Ctrl+F9', prefix: 'DN', color: '#14907f', hint: 'Purchase return / reduction in a purchase' },
};
export const VKEYS = Object.keys(VTYPES);
export const voucherNo = (type, n) => `${VTYPES[type].prefix}${String(n).padStart(4, '0')}`;

// ---------- ledgers ----------
// Customers and suppliers appear as ledgers automatically (Sundry Debtors / Creditors).
export function ledgerList(db) {
  const a = db.acc;
  const ops = a.openings || {};
  return [
    ...a.ledgers,
    ...db.customers.map((c) => ({ id: `cust:${c.id}`, name: c.name, group: 'debtors', opening: ops[`cust:${c.id}`] || 0, virtual: 'customer', gstin: c.gstin, stateCode: c.stateCode })),
    ...db.suppliers.map((s) => ({ id: `sup:${s.id}`, name: s.name, group: 'creditors', opening: ops[`sup:${s.id}`] || 0, virtual: 'supplier', gstin: s.gstin })),
  ];
}
export const ledgerMap = (db) => new Map(ledgerList(db).map((l) => [l.id, l]));
const groupMap = (db) => new Map(db.acc.groups.map((g) => [g.id, g]));
export function groupIds(db, id) {
  const out = new Set([id]);
  let grew = true;
  while (grew) { grew = false; for (const g of db.acc.groups) if (g.parent && out.has(g.parent) && !out.has(g.id)) { out.add(g.id); grew = true; } }
  return out;
}
export const groupPath = (db, id) => { const m = groupMap(db); const out = []; for (let g = m.get(id); g; g = m.get(g.parent)) out.unshift(g.name); return out; };
export const groupNature = (db, id) => groupMap(db).get(id)?.nature || 'E';

// ---------- automatic vouchers ----------
const cache = new WeakMap();
const stateOf = (gstin) => String(gstin || '').slice(0, 2);

export function autoVouchers(db) {
  if (cache.has(db)) return cache.get(db);
  const out = [];
  const prods = new Map(db.products.map((p) => [p.id, p]));
  const add = (o, id, dr, cr) => { if (Math.abs(dr || cr) < 0.005) return; o.push({ ledger: id, dr: round2(dr), cr: round2(cr) }); };

  for (const inv of db.invoices) {
    if (inv.cancelled) continue;
    const lines = [];
    const sales = {}, tax = {};
    for (const l of inv.items) {
      const id = salesLedgerId(prods.get(l.productId)?.category);
      sales[id] = (sales[id] || 0) + l.taxable;
      for (const [k, v] of [['cgst', l.cgst], ['sgst', l.sgst], ['igst', l.igst]]) if (v) { const t = taxLedgerId('o', k, k === 'igst' ? l.gst : l.gst / 2); tax[t] = (tax[t] || 0) + v; }
    }
    // Dr: what was settled at the counter, and the rest on the customer's account.
    const dr = {};
    let settled = 0;
    for (const p of inv.payments) {
      if (p.at) continue; // later settlements are receipts
      const id = p.mode === 'cash' ? L.cash : p.mode === 'points' ? L.loyalty : L.bank;
      dr[id] = (dr[id] || 0) + p.amount; settled += p.amount;
    }
    const onAccount = round2(inv.total - settled);
    for (const [id, v] of Object.entries(dr)) add(lines, id, v, 0);
    add(lines, `cust:${inv.customerId}`, onAccount > 0 ? onAccount : 0, 0);
    for (const [id, v] of Object.entries(sales)) add(lines, id, 0, v);
    for (const [id, v] of Object.entries(tax)) add(lines, id, 0, v);
    if (inv.roundOff > 0) add(lines, L.roundoff, 0, inv.roundOff); else if (inv.roundOff < 0) add(lines, L.roundoff, -inv.roundOff, 0);
    // Any leftover rounding difference goes to Round Off, so every voucher balances.
    const diff = round2(lines.reduce((s, l) => s + l.cr - l.dr, 0));
    if (Math.abs(diff) >= 0.005) lines.push({ ledger: L.roundoff, dr: diff > 0 ? diff : 0, cr: diff < 0 ? -diff : 0 });
    out.push({ id: `auto-${inv.id}`, type: 'sales', no: inv.no, date: inv.date.slice(0, 10), lines, narration: `Sale to ${inv.customerName}`, auto: true, link: { kind: 'invoice', id: inv.id }, at: inv.date });
  }

  for (const r of db.receipts) {
    out.push({ id: `auto-${r.id}`, type: 'receipt', no: r.no, date: r.date.slice(0, 10), lines: [{ ledger: r.mode === 'cash' ? L.cash : L.bank, dr: round2(r.amount), cr: 0 }, { ledger: `cust:${r.customerId}`, dr: 0, cr: round2(r.amount) }],
      narration: `Received from ${db.customers.find((c) => c.id === r.customerId)?.name || ''}${r.ref ? ` (${r.ref})` : ''}`, auto: true, link: { kind: 'receipt', id: r.id }, at: r.date });
  }

  for (const po of db.purchaseOrders) {
    if (!po.grn) continue;
    const sup = db.suppliers.find((s) => s.id === po.supplierId);
    const inter = stateOf(sup?.gstin) && stateOf(sup.gstin) !== stateOf(db.company.gstin || '') && stateOf(sup.gstin) !== db.company.stateCode;
    const lines = []; const tax = {};
    let base = 0;
    for (const l of po.items) {
      const v = l.qty * l.rate; base += v;
      if (inter) { const t = taxLedgerId('i', 'igst', l.gst); tax[t] = (tax[t] || 0) + v * l.gst / 100; }
      else for (const k of ['cgst', 'sgst']) { const t = taxLedgerId('i', k, l.gst / 2); tax[t] = (tax[t] || 0) + v * l.gst / 200; }
    }
    add(lines, L.purchase, base, 0);
    let total = base;
    for (const [id, v] of Object.entries(tax)) { add(lines, id, v, 0); total += v; }
    add(lines, `sup:${po.supplierId}`, 0, total);
    out.push({ id: `auto-${po.id}`, type: 'purchase', no: po.grn.billNo, date: po.grn.date.slice(0, 10), lines, narration: `Purchase ${po.no} from ${sup?.name || ''}`, auto: true, link: { kind: 'po', id: po.id }, at: po.grn.date });
    // Freight and other charges paid on receipt.
    const ch = po.grn.charges || {};
    const cl = [];
    for (const [k, id] of [['freight', L.freight], ['loading', L.loading], ['unloading', L.loading], ['insurance', L.insurance], ['other', L.other]]) add(cl, id, Number(ch[k]) || 0, 0);
    if (cl.length) { add(cl, L.cash, 0, cl.reduce((s, l) => s + l.dr, 0)); out.push({ id: `auto-${po.id}-chg`, type: 'payment', no: po.grn.no, date: po.grn.date.slice(0, 10), lines: cl, narration: `Freight and charges on ${po.no}`, auto: true, link: { kind: 'po', id: po.id }, at: po.grn.date }); }
  }
  cache.set(db, out);
  return out;
}

export function allVouchers(db) {
  const manual = db.acc.vouchers.map((v) => ({ ...v, auto: false }));
  return [...manual, ...autoVouchers(db)].sort((a, b) => a.date.localeCompare(b.date) || String(a.at || a.createdAt || '').localeCompare(String(b.at || b.createdAt || '')));
}
export const voucherTotal = (v) => round2(v.lines.reduce((s, l) => s + l.dr, 0));

// ---------- balances ----------
const FAR_PAST = '0000-01-01';
// Per ledger: opening (before `from`), debit and credit within [from, to], closing. Signed amounts: Dr positive.
export function balances(db, from = FAR_PAST, to = '9999-12-31') {
  const map = new Map(ledgerList(db).map((l) => [l.id, { open: l.opening || 0, dr: 0, cr: 0 }]));
  for (const v of allVouchers(db)) {
    if (v.date > to) continue;
    for (const l of v.lines) {
      const b = map.get(l.ledger) || (map.set(l.ledger, { open: 0, dr: 0, cr: 0 }), map.get(l.ledger));
      if (v.date < from) b.open += l.dr - l.cr; else { b.dr += l.dr; b.cr += l.cr; }
    }
  }
  for (const b of map.values()) { b.open = round2(b.open); b.dr = round2(b.dr); b.cr = round2(b.cr); b.close = round2(b.open + b.dr - b.cr); }
  return map;
}
export const balanceOf = (db, ledgerId, date) => balances(db, FAR_PAST, date).get(ledgerId)?.close || 0;

// ---------- stock (valued at average cost) ----------
// Anchored on today's stock: stock at an earlier date = today's stock minus the movements since.
export function stockAt(db, date) {
  const later = {};
  for (const m of db.stockLedger) if (m.date.slice(0, 10) > date) later[m.productId] = (later[m.productId] || 0) + m.qty;
  return round2(db.products.reduce((s, p) => s + (Number(p.stock) - (later[p.id] || 0)) * p.cost, 0));
}
export const dayBefore = (d) => { const x = new Date(d + 'T00:00:00'); x.setDate(x.getDate() - 1); return localDate(x); };
const openingStockLedger = (db) => { const ids = groupIds(db, 'stock'); return round2(ledgerList(db).filter((l) => ids.has(l.group)).reduce((s, l) => s + (l.opening || 0), 0)); };

// ---------- trial balance ----------
// Tree of groups → sub-groups → ledgers with signed totals.
export function trialTree(db, from, to) {
  const bal = balances(db, from, to);
  const leds = ledgerList(db);
  const sumNode = (n) => { for (const c of n.children) for (const k of ['open', 'dr', 'cr', 'close']) n[k] += c[k]; return n; };
  const build = (parent) => db.acc.groups.filter((g) => (g.parent || null) === parent).map((g) => {
    const node = { id: g.id, name: g.name, group: true, nature: g.nature, open: 0, dr: 0, cr: 0, close: 0, children: build(g.id) };
    for (const l of leds.filter((x) => x.group === g.id)) {
      const b = bal.get(l.id) || { open: 0, dr: 0, cr: 0, close: 0 };
      if (b.open || b.dr || b.cr || b.close) node.children.push({ id: l.id, name: l.name, ledger: true, virtual: l.virtual, open: b.open, dr: b.dr, cr: b.cr, close: b.close, children: [] });
    }
    return sumNode(node);
  }).filter((n) => n.children.length);
  const roots = build(null);
  const tot = { open: 0, dr: 0, cr: 0, close: 0 };
  for (const r of roots) for (const k of Object.keys(tot)) tot[k] += r[k];
  for (const k of Object.keys(tot)) tot[k] = round2(tot[k]);
  return { roots, total: tot };
}

// ---------- profit & loss and balance sheet ----------
function nominalRows(db, bal, gid, sign) { // sign +1: Dr − Cr (expenses), −1: Cr − Dr (income)
  const ids = groupIds(db, gid);
  return ledgerList(db).filter((l) => ids.has(l.group)).map((l) => { const b = bal.get(l.id); return { id: l.id, name: l.name, amount: round2(sign * ((b?.dr || 0) - (b?.cr || 0))) }; }).filter((r) => Math.abs(r.amount) >= 0.005);
}
const total = (rows) => round2(rows.reduce((s, r) => s + r.amount, 0));

export function profitLoss(db, from, to) {
  const bal = balances(db, from, to);
  const startsAtBooks = from <= (db.acc.booksFrom || FAR_PAST);
  const openStock = startsAtBooks ? openingStockLedger(db) : stockAt(db, dayBefore(from));
  const closeStock = stockAt(db, to);
  const r = { openStock, closeStock, purchases: nominalRows(db, bal, 'purchase', 1), dExp: nominalRows(db, bal, 'dexp', 1), sales: nominalRows(db, bal, 'sales', -1), dInc: nominalRows(db, bal, 'dincome', -1), iExp: nominalRows(db, bal, 'iexp', 1), iInc: nominalRows(db, bal, 'iincome', -1) };
  r.gross = round2(total(r.sales) + total(r.dInc) + closeStock - (openStock + total(r.purchases) + total(r.dExp)));
  r.net = round2(r.gross + total(r.iInc) - total(r.iExp));
  r.totals = { sales: total(r.sales), purchases: total(r.purchases), dExp: total(r.dExp), dInc: total(r.dInc), iExp: total(r.iExp), iInc: total(r.iInc) };
  return r;
}

export function balanceSheet(db, asOn) {
  const bal = balances(db, FAR_PAST, asOn);
  const leds = ledgerList(db);
  const pl = profitLoss(db, FAR_PAST, asOn);
  const stockIds = groupIds(db, 'stock');
  const section = (gids, sign) => gids.map((gid) => {
    const g = db.acc.groups.find((x) => x.id === gid);
    const ids = groupIds(db, gid);
    const rows = leds.filter((l) => ids.has(l.group) && !stockIds.has(l.group)).map((l) => ({ id: l.id, name: l.name, amount: round2(sign * (bal.get(l.id)?.close || 0)) })).filter((r) => Math.abs(r.amount) >= 0.005);
    return { id: gid, name: g.name, rows, amount: total(rows) };
  }).filter((s) => s.rows.length);
  const liabilities = section(['capital', 'loans', 'curliab'], -1);
  const assets = section(['fixed', 'invest', 'curassets'], 1);
  // Current assets also carry closing stock (valued from the inventory), which replaces the stock ledger.
  const ca = assets.find((s) => s.id === 'curassets') || (assets.push({ id: 'curassets', name: 'Current Assets', rows: [], amount: 0 }), assets.at(-1));
  if (pl.closeStock) { ca.rows.unshift({ id: 'closing-stock', name: 'Closing stock', amount: pl.closeStock }); ca.amount = round2(ca.amount + pl.closeStock); }
  const result = { liabilities, assets, net: pl.net };
  const opening = round2(leds.reduce((s, l) => s + (l.opening || 0), 0));
  result.openingDiff = opening; // Dr − Cr; non-zero means opening balances do not tally
  let L_ = total(liabilities) + (pl.net >= 0 ? pl.net : 0);
  let A_ = total(assets) + (pl.net < 0 ? -pl.net : 0);
  if (opening > 0) L_ += opening; else if (opening < 0) A_ += -opening;
  result.liabTotal = round2(L_); result.assetTotal = round2(A_);
  return result;
}

// ---------- ledger statement ----------
export function ledgerStatement(db, ledgerId, from, to) {
  const open = balances(db, from, to).get(ledgerId)?.open || 0;
  const names = ledgerMap(db);
  const rows = [];
  let run = open;
  for (const v of allVouchers(db)) {
    if (v.date < from || v.date > to) continue;
    const mine = v.lines.filter((l) => l.ledger === ledgerId);
    if (!mine.length) continue;
    const dr = round2(mine.reduce((s, l) => s + l.dr, 0)), cr = round2(mine.reduce((s, l) => s + l.cr, 0));
    const others = v.lines.filter((l) => l.ledger !== ledgerId).sort((a, b) => (b.dr + b.cr) - (a.dr + a.cr));
    const first = names.get(others[0]?.ledger)?.name || '—';
    run = round2(run + dr - cr);
    rows.push({ v, date: v.date, particulars: others.length > 1 ? `${first} +${others.length - 1} more` : first, dr, cr, balance: run });
  }
  return { open, rows, close: run, dr: round2(rows.reduce((s, r) => s + r.dr, 0)), cr: round2(rows.reduce((s, r) => s + r.cr, 0)) };
}

// ---------- formatting ----------
export const num2 = (n) => (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const drcr = (n) => (Math.abs(n) < 0.005 ? '—' : `${num2(Math.abs(n))} ${n > 0 ? 'Dr' : 'Cr'}`);

// ---------- periods ----------
export const fyStart = (d = new Date()) => `${d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1}-04-01`;
export function periodPresets(db) {
  const now = new Date(); const y = now.getFullYear(), m = now.getMonth();
  const iso = (d) => localDate(d);
  const q = Math.floor(m / 3) * 3;
  return [
    ['today', 'Today', localDate(), localDate()],
    ['month', 'This month', iso(new Date(y, m, 1)), localDate()],
    ['lastmonth', 'Last month', iso(new Date(y, m - 1, 1)), iso(new Date(y, m, 0))],
    ['quarter', 'This quarter', iso(new Date(y, q, 1)), localDate()],
    ['fy', 'This financial year', fyStart(now), localDate()],
    ['all', 'Since books began', db.acc.booksFrom || fyStart(now), localDate()],
  ];
}

// ---------- Tally XML export ----------
const x = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export function tallyXml(db, vouchers) {
  const names = ledgerMap(db);
  const type = { sales: 'Sales', purchase: 'Purchase', payment: 'Payment', receipt: 'Receipt', contra: 'Contra', journal: 'Journal', creditnote: 'Credit Note', debitnote: 'Debit Note' };
  const body = vouchers.map((v) => `<TALLYMESSAGE xmlns:UDF="TallyUDF"><VOUCHER VCHTYPE="${type[v.type]}" ACTION="Create"><DATE>${v.date.replace(/-/g, '')}</DATE><VOUCHERTYPENAME>${type[v.type]}</VOUCHERTYPENAME><VOUCHERNUMBER>${x(v.no)}</VOUCHERNUMBER><NARRATION>${x(v.narration)}</NARRATION>
${v.lines.map((l) => `<ALLLEDGERENTRIES.LIST><LEDGERNAME>${x(names.get(l.ledger)?.name || l.ledger)}</LEDGERNAME><ISDEEMEDPOSITIVE>${l.dr ? 'Yes' : 'No'}</ISDEEMEDPOSITIVE><AMOUNT>${l.dr ? -l.dr : l.cr}</AMOUNT></ALLLEDGERENTRIES.LIST>`).join('\n')}
</VOUCHER></TALLYMESSAGE>`).join('\n');
  return `<ENVELOPE><HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER><BODY><IMPORTDATA><REQUESTDESC><REPORTNAME>Vouchers</REPORTNAME><STATICVARIABLES><SVCURRENTCOMPANY>${x(db.company.name)}</SVCURRENTCOMPANY></STATICVARIABLES></REQUESTDESC><REQUESTDATA>\n${body}\n</REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>`;
}

export { daysBetween };
