import { ASSET_GROUPS, EXPENSE_GROUPS, GROUP_NATURE, INCOME_GROUPS, LIABILITY_GROUPS } from './constants';
import type { AppData, Dept, Ledger, Voucher, VoucherType, VLine } from './types';
import { sum } from './utils';

export const ledgersOf = (d: AppData, dept: Dept) => d.ledgers.filter((l) => l.dept === dept);
export const vouchersOf = (d: AppData, dept: Dept) => d.vouchers.filter((v) => v.dept === dept);
export const natureOf = (l: Ledger) => GROUP_NATURE[l.group];
export const sortVouchers = (list: Voucher[]) => [...list].sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);

/** Closing balance of every ledger in a department (debit positive, credit negative). */
export function closingMap(d: AppData, dept: Dept): Map<number, number> {
  const m = new Map<number, number>();
  for (const l of ledgersOf(d, dept)) m.set(l.id, l.open || 0);
  for (const v of vouchersOf(d, dept)) for (const x of v.lines) m.set(x.l, (m.get(x.l) ?? 0) + x.dr - x.cr);
  return m;
}

export const ledgerName = (d: AppData, id: number) => d.ledgers.find((l) => l.id === id)?.name ?? '?';
export const findLedgerByName = (d: AppData, dept: Dept, name: string) => {
  const n = name.trim().toLowerCase();
  return ledgersOf(d, dept).find((l) => l.name.toLowerCase() === n);
};

/** Income / expense effect of one voucher (used for period summaries). */
export function voucherIncome(d: AppData, v: Voucher) {
  return sum(v.lines, (y) => {
    const l = d.ledgers.find((q) => q.id === y.l);
    return l && natureOf(l) === 'I' ? y.cr - y.dr : 0;
  });
}
export function voucherExpense(d: AppData, v: Voucher) {
  return sum(v.lines, (y) => {
    const l = d.ledgers.find((q) => q.id === y.l);
    return l && natureOf(l) === 'E' ? y.dr - y.cr : 0;
  });
}

export const voucherTotal = (v: Voucher) => sum(v.lines, (y) => y.dr);
export const voucherSide = (d: AppData, v: Voucher, side: 'dr' | 'cr') =>
  [...new Set(v.lines.filter((y) => y[side] > 0).map((y) => ledgerName(d, y.l)))].join(', ');

export const nextVoucherNo = (d: AppData, dept: Dept, type: VoucherType) =>
  1 + Math.max(0, ...vouchersOf(d, dept).filter((v) => v.type === type).map((v) => v.no));

// ---------- reports ----------
export interface ReportGroup { group: string; items: { ledger: Ledger; amount: number }[] }

export function totals(d: AppData, dept: Dept) {
  const cl = closingMap(d, dept);
  const L = ledgersOf(d, dept);
  const income = sum(L.filter((l) => natureOf(l) === 'I'), (l) => -(cl.get(l.id) ?? 0));
  const expense = sum(L.filter((l) => natureOf(l) === 'E'), (l) => cl.get(l.id) ?? 0);
  const outstanding = sum(L.filter((l) => l.group === 'Sundry Debtors'), (l) => Math.max(cl.get(l.id) ?? 0, 0));
  return { income, expense, net: income - expense, outstanding, cl };
}

export function trialBalance(d: AppData, dept: Dept) {
  const cl = closingMap(d, dept);
  let dr = 0;
  let cr = 0;
  const groups: { group: string; rows: { ledger: Ledger; dr: number; cr: number }[] }[] = [];
  for (const g of [...LIABILITY_GROUPS, ...ASSET_GROUPS, ...INCOME_GROUPS, ...EXPENSE_GROUPS]) {
    const rows = ledgersOf(d, dept)
      .filter((l) => l.group === g && Math.abs(cl.get(l.id) ?? 0) > 0.004)
      .map((l) => {
        const b = cl.get(l.id) ?? 0;
        if (b > 0) dr += b; else cr -= b;
        return { ledger: l, dr: b > 0 ? b : 0, cr: b < 0 ? -b : 0 };
      });
    if (rows.length) groups.push({ group: g, rows });
  }
  return { groups, dr, cr, balanced: Math.abs(dr - cr) < 0.005 };
}

const sideGroups = (d: AppData, dept: Dept, groups: string[], sign: 1 | -1, cl: Map<number, number>): ReportGroup[] =>
  groups
    .map((g) => ({
      group: g,
      items: ledgersOf(d, dept)
        .filter((l) => l.group === g && Math.abs(cl.get(l.id) ?? 0) > 0.004)
        .map((l) => ({ ledger: l, amount: sign * (cl.get(l.id) ?? 0) })),
    }))
    .filter((g) => g.items.length);

export function profitLoss(d: AppData, dept: Dept) {
  const cl = closingMap(d, dept);
  const expenses = sideGroups(d, dept, EXPENSE_GROUPS, 1, cl);
  const incomes = sideGroups(d, dept, INCOME_GROUPS, -1, cl);
  const ex = sum(expenses, (g) => sum(g.items, (i) => i.amount));
  const inc = sum(incomes, (g) => sum(g.items, (i) => i.amount));
  return { expenses, incomes, net: inc - ex, total: Math.max(ex, inc) };
}

export function balanceSheet(d: AppData, dept: Dept) {
  const cl = closingMap(d, dept);
  const net = profitLoss(d, dept).net;
  const liabilities = sideGroups(d, dept, LIABILITY_GROUPS, -1, cl);
  const assets = sideGroups(d, dept, ASSET_GROUPS, 1, cl);
  const lt = sum(liabilities, (g) => sum(g.items, (i) => i.amount)) + (net >= 0 ? net : 0);
  const at = sum(assets, (g) => sum(g.items, (i) => i.amount)) + (net < 0 ? -net : 0);
  return { liabilities, assets, net, liabilityTotal: lt, assetTotal: at, balanced: Math.abs(lt - at) < 0.005 };
}

export function ledgerStatement(d: AppData, ledger: Ledger) {
  let b = ledger.open || 0;
  const rows: { v: Voucher; dr: number; cr: number; bal: number; others: string }[] = [];
  for (const v of sortVouchers(vouchersOf(d, ledger.dept).filter((x) => x.lines.some((y) => y.l === ledger.id)))) {
    const mine = v.lines.filter((y) => y.l === ledger.id);
    const dr = sum(mine, (y) => y.dr);
    const cr = sum(mine, (y) => y.cr);
    b += dr - cr;
    const others = [...new Set(v.lines.filter((y) => y.l !== ledger.id).map((y) => ledgerName(d, y.l)))].join(', ');
    rows.push({ v, dr, cr, bal: b, others });
  }
  return { rows, close: b, tdr: sum(rows, (r) => r.dr), tcr: sum(rows, (r) => r.cr) };
}

// ---------- voucher entry form <-> lines ----------
export interface VRow { s: 'Dr' | 'Cr'; n: string; a: string }
export interface VForm {
  type: VoucherType;
  mode: 'single' | 'grid';
  date: string;
  acct: string;
  rows: VRow[];
  narr: string;
  editId: number | null;
}

export const isSingleType = (t: VoucherType) => t === 'Payment' || t === 'Receipt' || t === 'Contra';
const blankRow = (s: 'Dr' | 'Cr' = 'Dr', n = ''): VRow => ({ s, n, a: '' });
const firstLedgerIn = (d: AppData, dept: Dept, groups: string[]) =>
  ledgersOf(d, dept).find((l) => groups.includes(l.group))?.name ?? '';

export function newVoucherForm(d: AppData, dept: Dept, type: VoucherType, date: string, narr = ''): VForm {
  const single = isSingleType(type);
  const rows: VRow[] = single
    ? [blankRow(), blankRow(), blankRow()]
    : type === 'Journal'
      ? [blankRow('Dr'), blankRow('Cr')]
      : type === 'Sales'
        ? [blankRow('Dr'), blankRow('Cr', firstLedgerIn(d, dept, ['Sales Accounts', 'Direct Incomes']))]
        : [blankRow('Dr', firstLedgerIn(d, dept, ['Purchase Accounts', 'Direct Expenses'])), blankRow('Cr')];
  return { type, mode: single ? 'single' : 'grid', date, acct: '', rows, narr, editId: null };
}

export function voucherToForm(d: AppData, v: Voucher): VForm {
  const drs = v.lines.filter((l) => l.dr > 0);
  const crs = v.lines.filter((l) => l.cr > 0);
  const clean = v.lines.every((l) => !(l.dr > 0 && l.cr > 0));
  const base = { type: v.type, date: v.date, narr: v.narr || '', editId: v.id };
  if (clean && (v.type === 'Payment' || v.type === 'Contra') && crs.length === 1)
    return { ...base, mode: 'single', acct: ledgerName(d, crs[0].l), rows: drs.map((l) => ({ s: 'Dr', n: ledgerName(d, l.l), a: String(l.dr) })) };
  if (clean && v.type === 'Receipt' && drs.length === 1)
    return { ...base, mode: 'single', acct: ledgerName(d, drs[0].l), rows: crs.map((l) => ({ s: 'Cr', n: ledgerName(d, l.l), a: String(l.cr) })) };
  return {
    ...base, mode: 'grid', acct: '',
    rows: v.lines.map((l) => ({ s: l.dr > 0 ? 'Dr' : 'Cr', n: ledgerName(d, l.l), a: String(l.dr || l.cr) })),
  };
}

/** Validates the entry form and returns balanced voucher lines, or an error message. */
export function formToLines(d: AppData, dept: Dept, f: VForm): { lines: VLine[] } | { error: string } {
  const rows = f.rows.filter((r) => r.n.trim() || Number(r.a));
  if (!f.date) return { error: 'Enter the voucher date' };
  if (!rows.length) return { error: 'Add at least one line' };
  for (const r of rows) if (!(Number(r.a) > 0)) return { error: 'Enter an amount for ' + (r.n || 'each line') };
  const get = (n: string) => findLedgerByName(d, dept, n);
  const missing = (n: string) => ({ error: `Ledger “${n}” not found. Click “+ Ledger” to create it.` });
  const lines: VLine[] = [];
  if (f.mode === 'single') {
    const a = get(f.acct);
    if (!a) return missing(f.acct);
    const found = [];
    for (const r of rows) {
      const l = get(r.n);
      if (!l) return missing(r.n);
      found.push({ l, amt: Number(r.a) });
    }
    if (f.type === 'Contra' && [a, ...found.map((x) => x.l)].some((l) => !['Cash-in-hand', 'Bank Accounts'].includes(l.group)))
      return { error: 'Contra is only between Cash and Bank ledgers' };
    const total = sum(found, (x) => x.amt);
    if (f.type === 'Receipt') {
      lines.push({ l: a.id, dr: total, cr: 0 });
      found.forEach((x) => lines.push({ l: x.l.id, dr: 0, cr: x.amt }));
    } else {
      lines.push({ l: a.id, dr: 0, cr: total });
      found.forEach((x) => lines.push({ l: x.l.id, dr: x.amt, cr: 0 }));
    }
    return { lines };
  }
  if (rows.length < 2) return { error: 'A voucher needs at least two lines (one Dr and one Cr)' };
  for (const r of rows) {
    const l = get(r.n);
    if (!l) return missing(r.n);
    lines.push({ l: l.id, dr: r.s === 'Dr' ? Number(r.a) : 0, cr: r.s === 'Cr' ? Number(r.a) : 0 });
  }
  const dr = sum(lines, (x) => x.dr);
  const cr = sum(lines, (x) => x.cr);
  if (Math.abs(dr - cr) > 0.005)
    return { error: `Debit ₹${dr.toFixed(2)} and Credit ₹${cr.toFixed(2)} do not match (difference ₹${Math.abs(dr - cr).toFixed(2)})` };
  return { lines };
}
