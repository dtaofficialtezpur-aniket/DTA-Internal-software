import { MONTHS } from './constants';
import { voucherExpense, voucherIncome, vouchersOf } from './books';
import type { Activity, AppData, Dept } from './types';
import { fmtD, p2, toISODate } from './utils';

export type PeriodMode = 'day' | 'month' | 'year';
export interface Period { mode: PeriodMode; ref: string }

export function periodRange(p: Period) {
  const [y, m] = p.ref.split('-').map(Number);
  if (p.mode === 'day') return { from: p.ref, to: p.ref, label: fmtD(p.ref) };
  if (p.mode === 'month') {
    const last = new Date(y, m, 0).getDate();
    return { from: `${y}-${p2(m)}-01`, to: `${y}-${p2(m)}-${p2(last)}`, label: `${MONTHS[m - 1]} ${y}` };
  }
  return { from: `${y}-01-01`, to: `${y}-12-31`, label: `Year ${y}` };
}

export function shiftPeriod(p: Period, n: number): Period {
  const [y, m, d] = p.ref.split('-').map(Number);
  const dt = p.mode === 'day' ? new Date(y, m - 1, d + n) : p.mode === 'month' ? new Date(y, m - 1 + n, 1) : new Date(y + n, 0, 1);
  return { mode: p.mode, ref: toISODate(dt) };
}

export interface PeriodStats { v: number; inc: number; exp: number; f: number; c: number; l: number; n: number }
export function periodStats(d: AppData, dept: Dept, from: string, to: string): PeriodStats {
  const V = vouchersOf(d, dept).filter((x) => x.date >= from && x.date <= to);
  const A = activityIn(d, dept, from, to);
  return {
    v: V.length,
    inc: V.reduce((t, x) => t + voucherIncome(d, x), 0),
    exp: V.reduce((t, x) => t + voucherExpense(d, x), 0),
    f: A.filter((a) => a.k === 'Filing').length,
    c: A.filter((a) => a.k === 'Client').length,
    l: A.filter((a) => a.k === 'Lead').length,
    n: A.length,
  };
}
export const activityIn = (d: AppData, dept: Dept, from: string, to: string): Activity[] =>
  d.activity.filter((a) => a.dept === dept && a.d >= from && a.d <= to);
