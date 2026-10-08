const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
export const fmtINR = (n) => inr.format(Number(n) || 0);

export function fmtDateTime(iso){
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
export function fmtDate(d){
  if (!d) return '—';
  return new Date(d.length === 10 ? d + 'T00:00:00+05:30' : d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
export function ago(iso){
  if (!iso) return 'never';
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 90) return 'just now';
  if (s < 3600) return Math.round(s / 60) + ' min ago';
  if (s < 86400) return Math.round(s / 3600) + ' h ago';
  if (s < 86400 * 30) return Math.round(s / 86400) + ' d ago';
  return fmtDate(iso);
}
export const todayStr = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
export function isOverdue(d, stage){ return !!d && d <= todayStr() && stage !== 'won' && stage !== 'lost'; }

export function rangePreset(key){
  const t = todayStr();
  const d = new Date(t + 'T00:00:00');
  const iso = (x) => x.toLocaleDateString('en-CA');
  if (key === 'today') return { from: t, to: t };
  if (key === '7d') { d.setDate(d.getDate() - 6); return { from: iso(d), to: t }; }
  if (key === '30d') { d.setDate(d.getDate() - 29); return { from: iso(d), to: t }; }
  if (key === 'month') { d.setDate(1); return { from: iso(d), to: t }; }
  return { from: '', to: '' };
}
