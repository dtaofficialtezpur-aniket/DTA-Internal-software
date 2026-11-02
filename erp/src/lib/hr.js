// HR rules: working days, attendance summary and payroll.
import { parseCsv, round2 } from './format.js';

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

// Salary for one employee and month. Days before today count; paid leave counts as present.
export function payrollFor(db, userId, month) {
  const p = db.hr.profiles[userId] || { salary: 0 };
  const today = new Date().toISOString().slice(0, 10);
  const work = monthDays(month).filter((d) => isWorkDay(db, d));
  // Punch-machine data is synced after the day ends, so today is not counted until tomorrow.
  const elapsed = work.filter((d) => d < today);
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

// Reads a biometric punch-machine export (eSSL / ZKTeco style CSV): one row per punch with an employee
// code and a date-time (or separate date and time columns). First punch of a day = in, last = out.
function toIso(dateStr, timeStr = '') {
  let s = `${dateStr} ${timeStr}`.trim().replace(/\s+/g, ' ');
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (m) {
    let h = +m[4];
    if (m[7]) h = (h % 12) + (/pm/i.test(m[7]) ? 12 : 0);
    return new Date(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2] - 1, +m[1], h, +m[5], +(m[6] || 0));
  }
  return null;
}
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function parsePunches(text, db) {
  const rows = parseCsv(text);
  const head = rows[0].map((h) => h.toLowerCase());
  const col = (re) => head.findIndex((h) => re.test(h));
  const idCol = col(/emp|enroll|user ?id|code|^id$|badge|card/);
  const dtCol = col(/date.?time|datetime|timestamp/);
  const dCol = dtCol >= 0 ? -1 : col(/date|day/);
  const tCol = dtCol >= 0 ? -1 : col(/time/);
  if (idCol < 0 || (dtCol < 0 && dCol < 0)) throw new Error('Expected columns for employee code and punch date/time.');
  const byCode = Object.fromEntries(Object.entries(db.hr.profiles).filter(([, p]) => p.biometricId).map(([uid, p]) => [String(p.biometricId).trim(), uid]));
  const days = {}; const unknown = new Set(); let punches = 0;
  for (const r of rows.slice(1)) {
    const code = String(r[idCol] || '').trim();
    const when = dtCol >= 0 ? toIso(r[dtCol]) : toIso(r[dCol], r[tCol]);
    if (!code || !when || isNaN(when)) continue;
    const userId = byCode[code];
    if (!userId) { unknown.add(code); continue; }
    punches++;
    const k = `${userId}|${ymd(when)}`;
    (days[k] ||= []).push(when);
  }
  const records = Object.entries(days).map(([k, ts]) => {
    const [userId, date] = k.split('|');
    ts.sort((a, b) => a - b);
    return { userId, date, in: ts[0].toISOString(), out: ts.length > 1 ? ts[ts.length - 1].toISOString() : '' };
  });
  return { records, punches, unknown: [...unknown] };
}
