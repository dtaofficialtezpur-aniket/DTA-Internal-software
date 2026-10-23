export const p2 = (n: number) => String(n).padStart(2, '0');

/** Local-date YYYY-MM-DD (avoids the UTC off-by-one around midnight in IST). */
export const toISODate = (dt: Date) => `${dt.getFullYear()}-${p2(dt.getMonth() + 1)}-${p2(dt.getDate())}`;
export const today = () => toISODate(new Date());
export const addDays = (n: number, from = new Date()) => {
  const t = new Date(from.getFullYear(), from.getMonth(), from.getDate() + n);
  return toISODate(t);
};
export const nowTime = () => {
  const t = new Date();
  return `${p2(t.getHours())}:${p2(t.getMinutes())}`;
};

export const inr = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');
export const m2 = (n: number) =>
  (Math.round(n * 100) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const balTxt = (b: number) => (Math.abs(b) < 0.005 ? '—' : m2(Math.abs(b)) + (b > 0 ? ' Dr' : ' Cr'));

export const fmtD = (d: string) =>
  new Date(d + 'T00:00:00Z').toLocaleDateString('en-IN', {
    weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC',
  });

export const sum = <T,>(a: T[], f: (x: T) => number) => a.reduce((t, x) => t + f(x), 0);
export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');
