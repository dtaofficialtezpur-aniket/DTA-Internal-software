// HR rules: working days, attendance summary and payroll.
import { round2 } from './format.js';

const pad = (n) => String(n).padStart(2, '0');
export const monthDays = (month) => {
  const [y, m] = month.split('-').map(Number);
  return [...Array(new Date(y, m, 0).getDate())].map((_, i) => `${y}-${pad(m)}-${pad(i + 1)}`);
};

export const isWorkDay = (db, iso) => db.settings.hr.workDays.includes(new Date(iso + 'T12:00:00').getDay());

export function leaveDaysIn(leave, month) {
  return monthDays(month).filter((d) => d >= leave.from && d <= leave.to).length;
}

export function hoursOf(a) {
  return a.in && a.out ? round2((new Date(a.out) - new Date(a.in)) / 3600000) : 0;
}

export function isLate(db, a) {
  const [h, m] = db.settings.hr.shiftStart.split(':').map(Number);
  const t = new Date(a.in);
  return t.getHours() * 60 + t.getMinutes() > h * 60 + m + 10;
}

// Salary for one employee and month. Days up to today count; paid leave counts as present.
export function payrollFor(db, userId, month) {
  const p = db.hr.profiles[userId] || { salary: 0 };
  const today = new Date().toISOString().slice(0, 10);
  const work = monthDays(month).filter((d) => isWorkDay(db, d));
  const elapsed = work.filter((d) => d <= today);
  const present = new Set(db.hr.attendance.filter((a) => a.userId === userId && a.date.startsWith(month)).map((a) => a.date));
  const leave = db.hr.leaves.filter((l) => l.userId === userId && l.status === 'approved' && l.type !== 'Unpaid')
    .reduce((s, l) => s + monthDays(month).filter((d) => d >= l.from && d <= l.to && isWorkDay(db, d) && !present.has(d)).length, 0);
  const presentDays = elapsed.filter((d) => present.has(d)).length;
  const lop = Math.max(0, elapsed.length - presentDays - leave);
  const perDay = work.length ? p.salary / work.length : 0;
  const gross = round2(p.salary - perDay * lop);
  const advances = db.hr.advances.filter((a) => a.userId === userId && a.status === 'approved' && a.recoverMonth === month);
  const deduction = round2(advances.reduce((s, a) => s + a.amount, 0));
  return { salary: p.salary, workDays: work.length, elapsed: elapsed.length, presentDays, leave, lop, perDay: round2(perDay), gross, deduction, net: round2(Math.max(0, gross - deduction)), advances };
}
