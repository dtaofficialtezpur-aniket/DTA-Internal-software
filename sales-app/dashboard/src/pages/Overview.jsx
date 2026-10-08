import { useEffect, useState } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { PRODUCTS, STAGES } from '../constants.js';
import { ago, fmtINR, rangePreset } from '../utils.js';
import { RangeFilter, Stat } from '../components/Bits.jsx';
import PresenceCard from '../components/PresenceCard.jsx';

const PRESETS = [['all', 'All time', rangePreset('all')], ['today', 'Today', rangePreset('today')], ['7d', '7 days', rangePreset('7d')], ['30d', '30 days', rangePreset('30d')], ['month', 'This month', rangePreset('month')]];

export default function Overview({ onOpenEmployee }){
  const { user, call, showToast } = useApp();
  const isAdmin = user.role === 'admin';
  const [range, setRange] = useState({ key: 'all', from: '', to: '' });
  const [data, setData] = useState(null);

  useEffect(() => {
    let live = true;
    call('stats', { from: range.from, to: range.to }).then((d) => live && setData(d)).catch((e) => showToast(e.message, 'err'));
    return () => { live = false; };
  }, [call, range.from, range.to, showToast]);

  if (!data) return <div className="muted">Loading…</div>;
  const t = data.totals;
  const maxStage = Math.max(1, ...Object.values(data.pipeline));

  return (
    <div className="page">
      <header className="page-head"><h1>{isAdmin ? 'Sales overview' : 'My dashboard'}</h1></header>
      <RangeFilter range={range} onChange={setRange} presets={PRESETS} />

      <div className="stats">
        <Stat label="Leads generated" value={t.leads} />
        <Stat label="Clients won" value={t.clients} sub={t.leads ? Math.round((t.clients / t.leads) * 100) + '% of leads' : ''} />
        <Stat label="Sales value" value={fmtINR(t.revenue)} />
        <Stat label="Activities logged" value={t.activities} />
        {isAdmin ? <Stat label="Active employees" value={t.employees} /> : <Stat label="Follow-ups due" value={data.followupsDue} />}
      </div>

      <div className="grid2">
        <section className="card">
          <h3>By product</h3>
          <table className="table"><thead><tr><th>Product</th><th className="num">Leads</th><th className="num">Clients</th><th className="num">Value</th></tr></thead>
            <tbody>{data.byProduct.map((p) => <tr key={p.productType}><td>{PRODUCTS[p.productType]}</td><td className="num">{p.leads}</td><td className="num">{p.clients}</td><td className="num">{fmtINR(p.revenue)}</td></tr>)}</tbody></table>
        </section>
        <section className="card">
          <h3>Pipeline now{isAdmin && data.followupsDue > 0 ? <span className="pill warn" style={{ marginLeft: 8 }}>{data.followupsDue} follow-ups due</span> : null}</h3>
          <div className="bars">
            {Object.entries(STAGES).map(([k, label]) => (
              <div className="bar-row" key={k}><span>{label}</span><div className="bar"><i className={'stage-' + k} style={{ width: (data.pipeline[k] / maxStage) * 100 + '%' }} /></div><b className="tabular">{data.pipeline[k]}</b></div>
            ))}
          </div>
        </section>
      </div>

      {isAdmin && (
        <>
          <PresenceCard onOpenEmployee={onOpenEmployee} />
          <section className="card">
            <h3>By state</h3>
            <div className="table-wrap"><table className="table"><thead><tr><th>State</th><th className="num">Employees</th><th className="num">Leads</th><th className="num">Clients</th><th className="num">Value</th></tr></thead>
              <tbody>{[...data.byState].sort((a, b) => b.revenue - a.revenue || b.leads - a.leads).map((s) => <tr key={s.state}><td>{s.state}</td><td className="num">{s.employees}</td><td className="num">{s.leads}</td><td className="num">{s.clients}</td><td className="num">{fmtINR(s.revenue)}</td></tr>)}
                {!data.byState.length && <tr><td colSpan="5" className="muted">No employees yet — add them from the Sales team page.</td></tr>}</tbody></table></div>
          </section>
          <section className="card">
            <h3>Employees</h3>
            <div className="table-wrap"><table className="table"><thead><tr><th>Employee</th><th>State</th><th className="num">Leads</th><th className="num">Clients</th><th className="num">Value</th><th className="num">Activities</th><th>Last active</th></tr></thead>
              <tbody>{[...data.employees].sort((a, b) => b.revenue - a.revenue || b.leads - a.leads).map((e) => (
                <tr key={e.id} className={e.status !== 'active' ? 'dim' : ''}>
                  <td><button className="link" onClick={() => onOpenEmployee(e.id)}>{e.fullName}</button>{e.status !== 'active' && <span className="tag">removed</span>}</td>
                  <td>{e.state || '—'}</td><td className="num">{e.leads}</td><td className="num">{e.clients}</td><td className="num">{fmtINR(e.revenue)}</td><td className="num">{e.activities}</td><td>{ago(e.lastActiveAt)}</td>
                </tr>))}</tbody></table></div>
          </section>
        </>
      )}
    </div>
  );
}
