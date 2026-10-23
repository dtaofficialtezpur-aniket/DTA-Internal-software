import { MONTHS } from './constants';
import type { Client, PanApp, PillTone } from './types';
import { p2, today } from './utils';

const RANK: Record<string, number> = { na: -1, filed: 0, active: 0, paused: 0, pending: 1, overdue: 2 };
export const worst = (a: PillTone[]): PillTone =>
  a.reduce<PillTone>((w, x) => (RANK[x] > RANK[w] ? x : w), 'na');

/** Status of a return given the value the user set and its due date (month index is 0-based). */
export function retSt(val: string | undefined, y: number, mi: number, day: number): PillTone {
  if (val === 'Filed') return 'filed';
  if (val === 'N/A') return 'na';
  return new Date() > new Date(y, mi, day, 23, 59, 59) ? 'overdue' : 'pending';
}

export const currentYear = () => new Date().getFullYear();
/** Financial-year start (April): Jan–Mar belongs to the previous year's FY. */
export const currentFY = () => (new Date().getMonth() >= 3 ? currentYear() : currentYear() - 1);
export const monthKey = (y: number, m1: number) => `${y}-${p2(m1)}`;
export const thisMonthKey = () => today().slice(0, 7);
export const prevMonthKey = () => {
  const t = new Date();
  const p = new Date(t.getFullYear(), t.getMonth() - 1, 1);
  return monthKey(p.getFullYear(), p.getMonth() + 1);
};

// ---------- GST (monthly: GSTR-1 due 11th, GSTR-3B due 20th) ----------
export function monthFil(c: Client, key: string) {
  const v = c.gstFiling?.[key] ?? {};
  const pre = c.dateGiven && key < c.dateGiven.slice(0, 7) ? 'N/A' : 'Pending';
  return {
    gstr1: v.gstr1 || pre,
    gstr3b: v.gstr3b || pre,
    payment: v.payment || (pre === 'N/A' ? 'Paid' : 'Unpaid'),
  };
}
export function gstState(c: Client): PillTone {
  const n = new Date();
  const f = monthFil(c, thisMonthKey());
  return worst([retSt(f.gstr1, n.getFullYear(), n.getMonth(), 11), retSt(f.gstr3b, n.getFullYear(), n.getMonth(), 20)]);
}

// ---------- ITR (yearly) ----------
export function yearFil(c: Client, y: number) {
  const v = c.itrFiling?.[String(y)] ?? {};
  const pre = c.dateGiven && y < Number(c.dateGiven.slice(0, 4)) ? 'N/A' : 'Pending';
  return { filed: v.filed || pre, payment: v.payment || (pre === 'N/A' ? 'Paid' : 'Unpaid') };
}
export function itrState(c: Client): PillTone {
  const f = yearFil(c, currentYear());
  if (f.filed === 'Filed') return 'filed';
  if (f.filed === 'N/A') return 'na';
  return c.dueDate && c.dueDate < today() ? 'overdue' : 'pending';
}

// ---------- TDS (monthly challan due 7th, quarterly returns) ----------
/** [year, month0, day] */
export const qDue = (fy: number, q: number): [number, number, number] =>
  [[fy, 6, 31], [fy, 9, 31], [fy + 1, 0, 31], [fy + 1, 4, 31]][q - 1] as [number, number, number];
export const qLabel = (fy: number, q: number) =>
  ['Apr–Jun', 'Jul–Sep', 'Oct–Dec', 'Jan–Mar'][q - 1] + ' ' + (q < 4 ? fy : fy + 1);
export function prevQuarter(): [number, number] {
  const n = new Date();
  const m = n.getMonth();
  const fy = m >= 3 ? n.getFullYear() : n.getFullYear() - 1;
  const cq = Math.floor(((m + 9) % 12) / 3) + 1;
  return cq > 1 ? [fy, cq - 1] : [fy - 1, 4];
}
export function qFil(c: Client, fy: number, q: number) {
  const v = c.tdsQtr?.[`${fy}-Q${q}`] ?? {};
  const u = qDue(fy, q);
  const pre = c.dateGiven && new Date(u[0], u[1], u[2]) < new Date(c.dateGiven) ? 'N/A' : 'Pending';
  return { ret: v.ret || pre, fee: v.fee || (pre === 'N/A' ? 'Paid' : 'Unpaid') };
}
export function tdsMon(c: Client, key: string) {
  const v = c.tdsFiling?.[key] ?? {};
  const pre = c.dateGiven && key < c.dateGiven.slice(0, 7) ? 'N/A' : 'Pending';
  return { pay: v.pay || pre };
}
export function tdsMonSt(c: Client, key: string): PillTone {
  const f = tdsMon(c, key).pay;
  const [y, m] = key.split('-').map(Number);
  return retSt(f === 'Paid' ? 'Filed' : f, y, m, 7);
}
export function tdsQSt(c: Client, fy: number, q: number): PillTone {
  const u = qDue(fy, q);
  return retSt(qFil(c, fy, q).ret, u[0], u[1], u[2]);
}
export function tdsState(c: Client): PillTone {
  const [fy, q] = prevQuarter();
  return worst([tdsMonSt(c, prevMonthKey()), tdsQSt(c, fy, q)]);
}
export const fyMonths = (fy: number) =>
  Array.from({ length: 12 }, (_, i) => {
    const mi = (3 + i) % 12;
    const y = fy + (3 + i >= 12 ? 1 : 0);
    return { mi, y, key: monthKey(y, mi + 1), name: MONTHS[mi] };
  });

// ---------- PAN (one-time application) ----------
export const panInfo = (c: Client): Required<PanApp> => ({
  type: 'New PAN', ack: '', applied: '', status: 'Not started', delivered: '', payment: 'Unpaid', ...(c.panApp ?? {}),
});
export function panState(c: Client): PillTone {
  if (panInfo(c).status === 'Delivered') return 'filed';
  return c.dueDate && c.dueDate < today() ? 'overdue' : 'pending';
}

/** One headline status per catalog client. */
export function accState(c: Client): PillTone {
  switch (c.service) {
    case 'GST': return gstState(c);
    case 'ITR': return itrState(c);
    case 'TDS': return tdsState(c);
    case 'PAN': return panState(c);
  }
  if (c.status === 'Completed') return 'filed';
  if (c.dueDate && c.dueDate < today()) return 'overdue';
  if (c.status === 'On Hold') return 'paused';
  if (c.status === 'Active') return 'active';
  return 'pending';
}

export const lowerPill = (v: string): PillTone => (v.toLowerCase().replace('n/a', 'na') as PillTone);
