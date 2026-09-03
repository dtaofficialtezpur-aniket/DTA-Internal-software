const DAY = 86400000;

export function addDays(d: Date, n: number): Date {
  const r = new Date(d.getTime());
  r.setDate(r.getDate() + n);
  return r;
}

export function startOfDay(d: Date): Date {
  const r = new Date(d.getTime());
  r.setHours(0, 0, 0, 0);
  return r;
}

export function diffDays(a: Date, b: Date): number {
  return Math.round((startOfDay(a).getTime() - startOfDay(b).getTime()) / DAY);
}

export function fmtDate(d: Date): string {
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function fmtDateTime(d: Date): string {
  return (
    d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) +
    ', ' +
    d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
  );
}

export function fmtMoney(n: number): string {
  return '₹' + Number(n).toLocaleString('en-IN');
}

export function timeAgo(d: Date): string {
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return mins + ' min ago';
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return hrs + ' hr' + (hrs > 1 ? 's' : '') + ' ago';
  const days = Math.round(hrs / 24);
  if (days < 30) return days + ' day' + (days > 1 ? 's' : '') + ' ago';
  return fmtDate(d);
}

export function maskKey(k: string): string {
  return k.slice(0, 8) + '••••••••' + k.slice(-4);
}
