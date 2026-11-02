import { useState } from 'react';
import { useStore } from '../../lib/store.jsx';
import { localDate } from '../../lib/crmMeta.js';
import { money } from '../../lib/format.js';
import { Field, HBar, Icon, Modal, PageHead, Stat } from '../../components/ui.jsx';

// Quarter view: monthly target vs won, open pipeline and probability-weighted forecast.
export default function Forecasts() {
  const { db, user, update, toast } = useStore();
  const [edit, setEdit] = useState(false);
  const [target, setTarget] = useState(db.crm.target);
  const now = new Date();
  const qStart = Math.floor(now.getMonth() / 3) * 3;
  const months = [0, 1, 2].map((i) => { const d = new Date(now.getFullYear(), qStart + i, 1); return localDate(d).slice(0, 7); });
  const label = (mk) => new Date(mk + '-01T00:00:00').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  const deals = db.crm.deals;
  const row = (list) => {
    const won = list.filter((d) => d.stage === 'Closed Won').reduce((s, d) => s + d.amount, 0);
    const open = list.filter((d) => !d.stage.startsWith('Closed'));
    return { won, pipeline: open.reduce((s, d) => s + d.amount, 0), weighted: open.reduce((s, d) => s + d.amount * (d.probability || 0) / 100, 0), count: list.length };
  };
  const perMonth = months.map((mk) => ({ mk, ...row(deals.filter((d) => d.closingDate?.slice(0, 7) === mk)) }));
  const q = perMonth.reduce((a, r) => ({ won: a.won + r.won, pipeline: a.pipeline + r.pipeline, weighted: a.weighted + r.weighted }), { won: 0, pipeline: 0, weighted: 0 });
  const qTarget = db.crm.target * 3;
  const owners = db.users.filter((u) => deals.some((d) => d.ownerId === u.id));

  return (
    <div className="page">
      <PageHead title="Forecasts" sub={`Quarter: ${label(months[0])} – ${label(months[2])}`}>
        {user.role === 'owner' && <button className="btn" onClick={() => setEdit(true)}><Icon name="edit" />Monthly target: {money(db.crm.target)}</button>}
      </PageHead>
      <div className="grid g4 stagger">
        <Stat label="Quarter target" value={qTarget} icon="target" />
        <Stat label="Achieved (won)" value={q.won} icon="check" tone="green" sub={`${Math.round(q.won / qTarget * 100)}% of target`} />
        <Stat label="Weighted forecast" value={q.won + q.weighted} icon="trend" tone="gold" sub="Won + open × probability" />
        <Stat label="Gap to target" value={Math.max(0, qTarget - q.won - q.weighted)} icon="alert" tone="red" />
      </div>
      <div className="card mt">
        <div className="card-head"><h3>By month</h3></div>
        <div className="table-wrap"><table className="t">
          <thead><tr><th>Month</th><th className="num">Target</th><th className="num">Won</th><th className="num">Open pipeline</th><th className="num">Weighted</th><th style={{ width: 220 }}>Achievement</th></tr></thead>
          <tbody>{perMonth.map((r) => (
            <tr key={r.mk}><td className="strong">{label(r.mk)}</td><td className="num">{money(db.crm.target)}</td><td className="num">{money(r.won)}</td><td className="num">{money(r.pipeline)}</td><td className="num">{money(r.weighted)}</td>
              <td><HBar pct={r.won / db.crm.target * 100} /><div className="small muted" style={{ marginTop: 3 }}>{Math.round(r.won / db.crm.target * 100)}% won · {Math.round((r.won + r.weighted) / db.crm.target * 100)}% forecast</div></td></tr>
          ))}</tbody>
        </table></div>
      </div>
      <div className="card mt">
        <div className="card-head"><h3>By salesperson (this quarter)</h3></div>
        <div className="table-wrap"><table className="t">
          <thead><tr><th>Owner</th><th className="num">Deals</th><th className="num">Won</th><th className="num">Open pipeline</th><th className="num">Weighted</th></tr></thead>
          <tbody>{owners.map((u) => { const r = row(deals.filter((d) => d.ownerId === u.id && months.includes(d.closingDate?.slice(0, 7)))); return (
            <tr key={u.id}><td className="strong">{u.name}</td><td className="num">{r.count}</td><td className="num">{money(r.won)}</td><td className="num">{money(r.pipeline)}</td><td className="num">{money(r.weighted)}</td></tr>); })}</tbody>
        </table></div>
      </div>
      {edit && <Modal title="Monthly sales target" onClose={() => setEdit(false)} footer={<><button className="btn" onClick={() => setEdit(false)}>Cancel</button><button className="btn primary" onClick={() => { update((d) => { d.crm.target = Number(target) || 0; }, ['Changed sales target', 'Forecast', money(target)]); toast('Target saved'); setEdit(false); }}>Save</button></>}>
        <Field label="Target per month (₹)"><input className="input num" autoFocus value={target} onChange={(e) => setTarget(e.target.value.replace(/\D/g, ''))} /></Field>
      </Modal>}
    </div>
  );
}
