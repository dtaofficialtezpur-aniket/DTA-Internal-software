// Earlier years of monthly totals, as if imported from the client's old system (Tally / Excel).
// They sit before the live data starts, so month-wise and year-wise views have history to show. All fictional.
const SEASON = [1.05, 1.1, 1.2, 1.0, 0.95, 0.75, 0.7, 0.8, 0.95, 1.15, 1.2, 1.1];
const pad = (n) => String(n).padStart(2, '0');

export function addHistory(db, rnd) {
  const first = db.invoices.map((i) => i.date).sort()[0];
  if (!first) return;
  const liveFrom = first.slice(0, 7);
  let y = Number(liveFrom.slice(0, 4)), m = Number(liveFrom.slice(5, 7)) - 1;
  const months = [];
  for (let k = 0; k < 36; k++) { m--; if (m < 0) { m = 11; y--; } months.unshift({ y, m }); }
  db.history = {
    liveFrom,
    months: months.map(({ y: yy, m: mm }) => {
      const yearsIn = yy - months[0].y + (mm - months[0].m) / 12;
      const revenue = Math.round(3.8e6 * Math.pow(1.14, yearsIn) * SEASON[mm] * (0.92 + rnd() * 0.16));
      const bills = Math.round(revenue / (48000 + rnd() * 14000));
      const wonCount = 1 + Math.floor(rnd() * 3);
      return {
        month: `${yy}-${pad(mm + 1)}`, revenue, bills,
        tonnage: Math.round(revenue / 63000 * 10) / 10,
        // Credit collections only (cash and UPI sales are paid at the counter).
        collected: Math.round(revenue * 1.18 * (0.12 + rnd() * 0.12)),
        leads: 4 + Math.floor(rnd() * 6), wonCount, won: Math.round(wonCount * (900000 + rnd() * 2200000)),
        purchases: Math.round(revenue * (0.84 + rnd() * 0.07)),
      };
    }),
  };
}
