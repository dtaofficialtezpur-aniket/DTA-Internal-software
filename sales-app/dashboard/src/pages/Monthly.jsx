import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { PRODUCTS } from '../constants.js';
import { fmtDate, fmtINR, fmtShort } from '../utils.js';
import { Stat } from '../components/Bits.jsx';
import { downloadRows } from '../backup.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const yearLabel = (fy, y) => (fy ? `FY ${y}-${String(y + 1).slice(2)}` : String(y));

export default function Monthly({ initialUserId }){
  const { user, call, showToast } = useApp();
  const isAdmin = user.role === 'admin';
  const [fy, setFy] = useState(false);
  const [year, setYear] = useState(null);
  const [userId, setUserId] = useState(initialUserId ? String(initialUserId) : '');
  const [team, setTeam] = useState([]);
  const [data, setData] = useState(null);
  const [month, setMonth] = useState(null); // "YYYY-M" to focus the client list on one month

  useEffect(() => { if (isAdmin) call('listTeam').then((d) => setTeam(d.team)).catch(() => {}); }, [isAdmin, call]);
  useEffect(() => {
    let live = true;
    call('monthlyWon', { fy, year: year ?? undefined, userId }).then((d) => { if (live) { setData(d); setYear(d.year); setMonth(null); } }).catch((e) => showToast(e.message, 'err'));
    return () => { live = false; };
  }, [call, fy, year, userId, showToast]);

  const stats = useMemo(() => {
    if (!data) return null;
    const active = data.months.filter((m) => m.clients > 0);
    const best = data.months.reduce((b, m) => (m.revenue > b.revenue ? m : b), data.months[0]);
    return { avg: active.length ? data.totals.revenue / active.length : 0, best };
  }, [data]);

  if (!data) return <div className="muted">Loading…</div>;
  const max = Math.max(1, ...data.months.map((m) => m.revenue));
  const key = (m) => `${m.year}-${m.month}`;
  const shown = month ? data.clients.filter((c) => { const d = new Date(c.wonAt); return `${d.getFullYear()}-${d.getMonth() + 1}` === month; }) : data.clients;
  const monthName = (m) => `${MONTHS[m.month - 1]} ${m.year}`;

  const exportCsv = () => downloadRows(`dta-sales-won-clients-${yearLabel(fy, data.year).replace(/\s/g, '')}.csv`,
    [['wonAt', 'Won on'], ['name', 'Client'], ['employee', 'Employee'], ['state', 'State'], ['city', 'City'], ['productType', 'Product type'], ['productName', 'Product'], ['dealValue', 'Deal value (INR)']],
    data.clients);

  return (
    <div className="page">
      <header className="page-head"><h1>Monthly business</h1><button className="btn" onClick={exportCsv} disabled={!data.clients.length}>Download won clients (CSV)</button></header>
      <p className="muted" style={{ margin: 0 }}>Clients won each month and the business value of their deals — counted in the month the deal was marked <b>Won</b>.</p>

      <div className="filters">
        <button className={'chip' + (!fy ? ' on' : '')} onClick={() => { setFy(false); setYear(null); }}>Calendar year</button>
        <button className={'chip' + (fy ? ' on' : '')} onClick={() => { setFy(true); setYear(null); }}>Financial year (Apr–Mar)</button>
        <select value={data.year} onChange={(e) => setYear(Number(e.target.value))} aria-label="Year">
          {[...data.years].reverse().map((y) => <option key={y} value={y}>{yearLabel(fy, y)}</option>)}</select>
        {isAdmin && <select value={userId} onChange={(e) => { setUserId(e.target.value); setYear(null); }} aria-label="Employee"><option value="">All employees</option>{team.map((t) => <option key={t.id} value={t.id}>{t.fullName} ({t.state})</option>)}</select>}
      </div>

      <div className="stats">
        <Stat label={`Business in ${yearLabel(fy, data.year)}`} value={fmtINR(data.totals.revenue)} />
        <Stat label="Clients won" value={data.totals.clients} />
        <Stat label="Average per active month" value={fmtINR(stats.avg)} />
        <Stat label="Best month" value={stats.best.revenue > 0 ? monthName(stats.best) : '—'} sub={stats.best.revenue > 0 ? fmtINR(stats.best.revenue) : ''} />
      </div>

      <section className="card">
        <h3>Business per month</h3>
        <div className="mbars" role="img" aria-label="Business value won per month">
          {data.months.map((m) => (
            <button key={key(m)} className={'mbar' + (month === key(m) ? ' on' : '')} onClick={() => setMonth(month === key(m) ? null : key(m))} title={`${monthName(m)}: ${fmtINR(m.revenue)} · ${m.clients} clients`}>
              <span className="mbar-val tabular">{m.revenue > 0 ? fmtShort(m.revenue) : ''}</span>
              <span className="mbar-col"><i style={{ height: (m.revenue / max) * 100 + '%' }} /></span>
              <span className="mbar-lbl">{MONTHS[m.month - 1]}</span>
            </button>))}
        </div>
      </section>

      <section className="card table-wrap">
        <table className="table">
          <thead><tr><th>Month</th><th className="num">Clients won</th>{Object.values(PRODUCTS).map((p) => <th key={p} className="num">{p}</th>)}<th className="num">Total business</th></tr></thead>
          <tbody>
            {data.months.map((m) => (
              <tr key={key(m)} className={month === key(m) ? 'row-on' : ''}>
                <td><button className="link" onClick={() => setMonth(month === key(m) ? null : key(m))}>{monthName(m)}</button></td>
                <td className="num">{m.clients}</td>
                {Object.keys(PRODUCTS).map((p) => <td key={p} className="num">{m.byProduct[p] ? fmtINR(m.byProduct[p]) : '—'}</td>)}
                <td className="num"><b>{fmtINR(m.revenue)}</b></td>
              </tr>))}
            <tr className="total-row"><td><b>Total {yearLabel(fy, data.year)}</b></td><td className="num"><b>{data.totals.clients}</b></td>
              {Object.keys(PRODUCTS).map((p) => <td key={p} className="num"><b>{fmtINR(data.months.reduce((s, m) => s + m.byProduct[p], 0))}</b></td>)}
              <td className="num"><b>{fmtINR(data.totals.revenue)}</b></td></tr>
          </tbody>
        </table>
      </section>

      {isAdmin && !userId && data.byEmployee.length > 0 && (
        <section className="card table-wrap">
          <h3>By employee — {yearLabel(fy, data.year)}</h3>
          <table className="table"><thead><tr><th>Employee</th><th className="num">Clients won</th><th className="num">Business</th></tr></thead>
            <tbody>{[...data.byEmployee].sort((a, b) => b.revenue - a.revenue).map((e) => (
              <tr key={e.userId}><td><button className="link" onClick={() => setUserId(String(e.userId))}>{e.employee}</button></td><td className="num">{e.clients}</td><td className="num">{fmtINR(e.revenue)}</td></tr>))}</tbody></table>
        </section>)}

      <section className="card table-wrap">
        <div className="split"><h3>{month ? `Clients won in ${monthName(data.months.find((m) => key(m) === month))}` : `All clients won in ${yearLabel(fy, data.year)}`} ({shown.length})</h3>
          {month && <button className="btn ghost" onClick={() => setMonth(null)}>Show whole year</button>}</div>
        <table className="table">
          <thead><tr><th>Won on</th><th>Client</th>{isAdmin && <th>Employee</th>}<th>State</th><th>Product</th><th className="num">Deal value</th></tr></thead>
          <tbody>
            {shown.map((c) => (
              <tr key={c.id}><td>{fmtDate(c.wonAt)}</td><td>{c.name}</td>{isAdmin && <td>{c.employee}</td>}<td>{c.state}{c.city ? <div className="muted small">{c.city}</div> : null}</td>
                <td>{PRODUCTS[c.productType]}{c.productName && <div className="muted small">{c.productName}</div>}</td><td className="num">{fmtINR(c.dealValue)}</td></tr>))}
            {!shown.length && <tr><td colSpan="6" className="muted">No clients won in this period.</td></tr>}
          </tbody>
        </table>
      </section>
    </div>
  );
}
