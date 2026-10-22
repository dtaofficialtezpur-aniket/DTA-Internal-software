// Pure formatting/status helpers — no DOM access, no React, no network.
const DAY = 86400000;
function startOfDay(d){ const r = new Date(d.getTime()); r.setHours(0,0,0,0); return r; }
export function diffDays(a, b){ return Math.round((startOfDay(a) - startOfDay(b)) / DAY); }

export function fmtDate(d){ return d.toLocaleDateString('en-IN', {day:'numeric', month:'short', year:'numeric'}); }
export function fmtDateTime(d){ return d.toLocaleDateString('en-IN', {day:'numeric', month:'short', year:'numeric'}) + ', ' + d.toLocaleTimeString('en-IN', {hour:'2-digit', minute:'2-digit'}); }
export function fmtMoney(n){ return '₹' + Number(n).toLocaleString('en-IN'); }
export function fmtBytes(n){
  if (n < 1024) return n + ' B';
  if (n < 1024*1024) return (n/1024).toFixed(1) + ' KB';
  return (n/1024/1024).toFixed(1) + ' MB';
}

export function timeAgo(d){
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return mins + ' min ago';
  const hrs = Math.round(mins/60);
  if (hrs < 24) return hrs + ' hr' + (hrs>1?'s':'') + ' ago';
  const days = Math.round(hrs/24);
  if (days < 30) return days + ' day' + (days>1?'s':'') + ' ago';
  return fmtDate(d);
}

export function computeStatus(c, leadDays){
  if (c.status === 'paused') return 'paused';
  const d = diffDays(c.nextDue, new Date());
  if (d < 0) return 'overdue';
  if (d <= leadDays) return 'due';
  return 'active';
}
export const STATUS_META = {
  active:  {cls:'pill-active',  label:'Active'},
  due:     {cls:'pill-due',     label:'Due soon'},
  overdue: {cls:'pill-overdue', label:'Overdue'},
  paused:  {cls:'pill-paused',  label:'Paused'},
};
export function actionColor(action){
  if (action === 'paused') return 'var(--crit)';
  if (action === 'reminder') return 'var(--warn)';
  return 'var(--good)';
}
export function maskKey(k){ return k.slice(0,8) + '••••••••' + k.slice(-4); }

// Domain renewals: warn this many days before a client's domain expires.
export const DOMAIN_WARN_DAYS = 30;
export function parseDateOnly(s){ return s ? new Date(s + 'T00:00:00') : null; }
// Days until the domain expires (negative = already expired), or null if no date is set.
export function domainDaysLeft(c){
  const d = parseDateOnly(c.domainExpiry);
  return d ? diffDays(d, new Date()) : null;
}
// Every client (either type) whose domain has expired or expires within DOMAIN_WARN_DAYS, soonest first.
export function domainAlerts(clients, normalClients){
  const rows = [
    ...clients.map((c) => ({ kind: 'subscription', c })),
    ...normalClients.map((c) => ({ kind: 'normal', c })),
  ].map((r) => ({ ...r, days: domainDaysLeft(r.c) }))
    .filter((r) => r.days !== null && r.days <= DOMAIN_WARN_DAYS);
  return rows.sort((a, b) => a.days - b.days);
}
export function domainLabel(days){
  if (days < 0) return 'Expired ' + Math.abs(days) + ' day' + (Math.abs(days) === 1 ? '' : 's') + ' ago';
  if (days === 0) return 'Expires today';
  return 'Expires in ' + days + ' day' + (days === 1 ? '' : 's');
}

// Where a normal client's job stands. Keys match NORMAL_WORK_STATUSES in api.php.
export const WORK_STATUSES = [
  { key: 'advance_received', label: 'Advance payment received', cls: 'pill-info' },
  { key: 'in_progress',      label: 'Work in progress',         cls: 'pill-due' },
  { key: 'domain_bought',    label: 'Domain bought',            cls: 'pill-info' },
  { key: 'work_done',        label: 'Work done',                cls: 'pill-active' },
  { key: 'handover_done',    label: 'Handover done',            cls: 'pill-active' },
];
