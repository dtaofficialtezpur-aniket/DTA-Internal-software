'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo } from 'react';
import { DEPT_LABEL, MONTHS, serviceLabel, servicesOf } from '@/lib/constants';
import { totals, vouchersOf, sortVouchers } from '@/lib/books';
import { accState } from '@/lib/filings';
import { activityIn, periodRange, periodStats, shiftPeriod, type Period, type PeriodMode } from '@/lib/periods';
import { route } from '@/lib/routes';
import { useData } from '@/lib/store';
import type { Dept } from '@/lib/types';
import { cx, fmtD, inr, m2, p2, today } from '@/lib/utils';
import { ActivityList } from './ActivityList';
import { VoucherTable } from './VoucherTable';
import { Empty, Kpi, KpiGrid, PageHeader, Pill, Seg, Toolbar } from '../ui';

const MODES: [PeriodMode, string][] = [['day', 'Day'], ['month', 'Month'], ['year', 'Year']];

export function DashboardView({ dept }: { dept: Dept }) {
  const d = useData();
  const router = useRouter();
  const sp = useSearchParams();
  const modeQ = sp.get('m');
  const refQ = sp.get('ref') ?? '';
  const per: Period = {
    mode: modeQ === 'day' || modeQ === 'year' ? modeQ : 'month',
    ref: /^\d{4}-\d{2}-\d{2}$/.test(refQ) ? refQ : today(),
  };
  const go = (p: Period) => router.replace(route(dept, 'dashboard', { m: p.mode, ref: p.ref }));

  const r = periodRange(per);
  const [y, mon] = per.ref.split('-').map(Number);
  const S = useMemo(() => periodStats(d, dept, r.from, r.to), [d, dept, r.from, r.to]);
  const A = useMemo(() => activityIn(d, dept, r.from, r.to), [d, dept, r.from, r.to]);
  const T = useMemo(() => totals(d, dept), [d, dept]);

  const rows = useMemo(() => {
    if (per.mode === 'year')
      return MONTHS.map((name, i) => {
        const last = new Date(y, i + 1, 0).getDate();
        const from = `${y}-${p2(i + 1)}-01`;
        return { label: name, from, to: `${y}-${p2(i + 1)}-${p2(last)}`, go: { mode: 'month' as const, ref: from } };
      });
    if (per.mode === 'month')
      return Array.from({ length: new Date(y, mon, 0).getDate() }, (_, i) => {
        const dd = `${y}-${p2(mon)}-${p2(i + 1)}`;
        return { label: fmtD(dd), from: dd, to: dd, go: { mode: 'day' as const, ref: dd } };
      });
    return [];
  }, [per.mode, y, mon]);
  const stats = useMemo(() => rows.map((x) => ({ x, s: periodStats(d, dept, x.from, x.to) })), [rows, d, dept]);
  const max = Math.max(1, ...stats.map((z) => z.s.n));

  const debtors = d.ledgers.filter((l) => l.dept === dept && l.group === 'Sundry Debtors' && (T.cl.get(l.id) ?? 0) > 0.004);
  const services = servicesOf(dept);
  const empty = d.clients.filter((c) => c.type === dept).length === 0 && vouchersOf(d, dept).length === 0 && d.leads.every((l) => l.dept !== dept);

  return (
    <>
      <PageHeader title={`${DEPT_LABEL[dept]} · Dashboard`} sub={`What was done — by day, month and year. Only ${DEPT_LABEL[dept]} is shown.`} />
      <Toolbar>
        <Seg value={per.mode} options={MODES} onChange={(m) => go({ mode: m, ref: per.ref })} />
        <button className="btn-sec" onClick={() => go(shiftPeriod(per, -1))} aria-label="Previous">‹</button>
        {per.mode === 'day' && <input type="date" className="inp !w-auto" value={per.ref} onChange={(e) => e.target.value && go({ mode: 'day', ref: e.target.value })} />}
        {per.mode === 'month' && <input type="month" className="inp !w-auto" value={per.ref.slice(0, 7)} onChange={(e) => e.target.value && go({ mode: 'month', ref: e.target.value + '-01' })} />}
        {per.mode === 'year' && <input type="number" min={2000} max={2100} className="inp !w-24" value={y} onChange={(e) => { const v = Number(e.target.value); if (v >= 2000 && v <= 2100) go({ mode: 'year', ref: `${v}-01-01` }); }} />}
        <button className="btn-sec" onClick={() => go(shiftPeriod(per, 1))} aria-label="Next">›</button>
        <button className="btn-sec" onClick={() => go({ mode: per.mode, ref: today() })}>Today</button>
        <span className="flex-1" />
        <b className="text-base text-brand-dark">{r.label}</b>
      </Toolbar>

      {empty && (
        <div className="card mb-4">
          <Empty title="Your books are empty" hint="Start by adding a client, creating a ledger, or entering a voucher. Everything you add is saved on this device.">
            <a className="btn-pri" href={route(dept, 'vouchers')}>Enter a voucher</a>
            <a className="btn-sec" href={dept === 'marketing' ? route(dept, 'clients', { new: 1 }) : route(dept, `services/${services[0].slug}`, { new: 1 })}>Add a client</a>
            <a className="btn-sec" href={route(dept, 'crm', { new: 1 })}>Add a lead</a>
          </Empty>
        </div>
      )}

      <KpiGrid>
        <Kpi label="Income" value={inr(S.inc)} tone="good" />
        <Kpi label="Expenses" value={inr(S.exp)} tone="bad" />
        <Kpi label="Net profit" value={inr(S.inc - S.exp)} tone={S.inc - S.exp >= 0 ? 'good' : 'bad'} />
        <Kpi label="Outstanding (receivable now)" value={inr(T.outstanding)} tone="warn" />
        <Kpi label="Vouchers" value={S.v} />
        <Kpi label="Actions done" value={S.n} />
      </KpiGrid>

      {per.mode !== 'day' ? (
        <div className="card mt-3.5 overflow-x-auto">
          <b>{per.mode === 'year' ? 'Month-wise' : 'Day-wise'} summary</b>
          <p className="mb-2 text-sm text-mute">Click a row to open that {per.mode === 'year' ? 'month' : 'day'}.</p>
          <table className="tbl">
            <thead>
              <tr>
                <th>{per.mode === 'year' ? 'Month' : 'Date'}</th><th className="r">Vouchers</th><th className="r">Income (₹)</th><th className="r">Expenses (₹)</th>
                <th className="r">Filings</th><th className="r">Clients</th><th className="r">Leads</th><th className="min-w-[120px]">Activity</th>
              </tr>
            </thead>
            <tbody>
              {stats.map(({ x, s }) => (
                <tr key={x.from} className={cx('click', !s.n && 'text-mute')} onClick={() => go(x.go)}>
                  <td>{x.label}</td><td className="r">{s.v || '–'}</td><td className="r">{s.inc ? m2(s.inc) : '–'}</td><td className="r">{s.exp ? m2(s.exp) : '–'}</td>
                  <td className="r">{s.f || '–'}</td><td className="r">{s.c || '–'}</td><td className="r">{s.l || '–'}</td>
                  <td><div className="h-2.5 overflow-hidden rounded-full bg-line"><i className="block h-full rounded-full bg-brand" style={{ width: `${(s.n / max) * 100}%` }} /></div></td>
                </tr>
              ))}
              <tr className="font-bold">
                <td>Total</td><td className="r">{S.v}</td><td className="r">{m2(S.inc)}</td><td className="r">{m2(S.exp)}</td><td className="r">{S.f}</td><td className="r">{S.c}</td><td className="r">{S.l}</td><td>{S.n} actions</td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card mt-3.5 overflow-x-auto">
          <b>Vouchers on this day</b>
          <VoucherTable d={d} list={sortVouchers(vouchersOf(d, dept).filter((x) => x.date === per.ref))} />
        </div>
      )}

      <div className="card mt-3.5">
        <b>{per.mode === 'day' ? 'What was done on this day' : per.mode === 'month' ? 'Activity this month' : 'Activity this year'}</b>
        <div className="mt-2"><ActivityList items={A} limit={per.mode === 'day' ? 200 : 40} asc={per.mode === 'day'} /></div>
      </div>

      <div className="mt-3.5 grid gap-3.5 md:grid-cols-2">
        <div className="card">
          <b>{services.length ? 'Clients by service' : 'Clients'}</b>
          <div className="mt-2.5">
            {services.length ? (
              services.map((s) => {
                const L = d.clients.filter((c) => c.type === dept && c.service === s.name);
                const od = L.filter((c) => accState(c) === 'overdue').length;
                return L.length ? (
                  <div key={s.slug} className="flex justify-between border-t border-line py-2 first:border-t-0"><span>{serviceLabel(s.name)}</span><span>{L.length} client{L.length > 1 ? 's' : ''} {od > 0 && <><Pill tone="overdue" /> {od}</>}</span></div>
                ) : null;
              })
            ) : (
              d.clients.filter((c) => c.type === dept).map((c) => <div key={c.id} className="flex justify-between border-t border-line py-2 first:border-t-0"><span>{c.name}</span><Pill tone={c.status === 'active' ? 'active' : 'paused'} /></div>)
            )}
            {d.clients.every((c) => c.type !== dept) && <p className="text-sm text-mute">No clients yet.</p>}
          </div>
        </div>
        <div className="card">
          <b>Money to collect</b>
          <div className="mt-2.5">
            {debtors.map((l) => <div key={l.id} className="flex justify-between border-t border-line py-2 first:border-t-0"><span>{l.name}</span><b className="text-warn">{m2(T.cl.get(l.id) ?? 0)}</b></div>)}
            {!debtors.length && <p className="text-sm text-mute">All clear.</p>}
          </div>
        </div>
      </div>
    </>
  );
}
