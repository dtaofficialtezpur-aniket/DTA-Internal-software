import { useState } from 'react';
import { useStore } from '../lib/store.jsx';
import { qty, dateTime, nowIso, uid } from '../lib/format.js';
import { DemoLeft, Empty, Field, Icon, Modal, PageHead, Stat } from '../components/ui.jsx';

const SENSITIVE = ['Failed login', 'Cancelled invoice', 'Stock adjustment', 'Changed price', 'Bulk price change', 'Deleted pricelist', 'Edited user', 'Reset PIN', 'Changed settings'];

export default function Security() {
  const { db, user, update, toast, guard } = useStore();
  const [entry, setEntry] = useState(null);
  const todayKey = new Date().toDateString();
  const today = (ts) => new Date(ts).toDateString() === todayKey;
  const awaiting = db.gateLog.filter((g) => g.type === 'out' && !g.verified);
  const todayGate = db.gateLog.filter((g) => today(g.at));
  const failed = db.audit.filter((a) => a.action === 'Failed login' && today(a.ts));
  const alerts = db.audit.filter((a) => SENSITIVE.includes(a.action) || /override|approved by/i.test(a.detail)).slice(0, 25);
  const flagged = db.picklists.filter((p) => p.flag && p.status !== 'cancelled');

  const verify = (g) => {
    update((d) => { Object.assign(d.gateLog.find((x) => x.id === g.id), { verified: true, verifiedBy: user.name, verifiedAt: nowIso() }); }, ['Gate pass verified', 'Gate', `${g.vehicle} · ${g.ref}`]);
    toast(`${g.vehicle} cleared at gate`);
  };

  return (
    <div className="page">
      <PageHead title="Security Dashboard" sub="Gate passes, weight variances and sensitive activity">
        <DemoLeft kind="gate" />
        <button className="btn primary" onClick={() => setEntry({ type: 'in', vehicle: '', driver: '', purpose: 'Supplier delivery' })}><Icon name="plus" />Gate entry</button>
      </PageHead>
      <div className="grid g4 stagger">
        <Stat label="Awaiting exit check" value={awaiting.length} money={false} icon="truck" tone={awaiting.length ? 'gold' : ''} />
        <Stat label="Gate movements today" value={todayGate.length} money={false} icon="clock" />
        <Stat label="Weight variances" value={flagged.length} money={false} icon="scale" tone={flagged.length ? 'red' : 'green'} />
        <Stat label="Failed logins today" value={failed.length} money={false} icon="lock" tone={failed.length ? 'red' : 'green'} />
      </div>
      <div className="grid g2 mt stagger">
        <div className="card">
          <div className="card-head"><h3>Outgoing vehicles — verify gate pass</h3></div>
          {awaiting.map((g) => (
            <div className="list-row" key={g.id}>
              <span className="mini-ic gold"><Icon name="truck" /></span>
              <div className="grow small"><b>{g.vehicle}</b> · {g.driver || 'Driver not recorded'}<div className="muted">{g.ref} · {qty(g.kg)} kg · {dateTime(g.at)}</div></div>
              <button className="btn sm primary" onClick={() => verify(g)}><Icon name="check" />Clear</button>
            </div>
          ))}
          {!awaiting.length && <Empty icon="check" text="No vehicles waiting." />}
        </div>
        <div className="card">
          <div className="card-head"><h3>Gate register</h3></div>
          <div className="table-wrap"><table className="t"><thead><tr><th>Time</th><th>In / out</th><th>Vehicle</th><th>Details</th></tr></thead>
            <tbody>{db.gateLog.slice(-12).reverse().map((g) => (
              <tr key={g.id}><td className="small">{dateTime(g.at)}</td><td><span className={`badge ${g.type === 'in' ? 'blue' : 'gold'}`}>{g.type === 'in' ? 'In' : 'Out'}</span></td><td className="strong">{g.vehicle}</td>
                <td className="small">{g.ref || g.purpose}{g.verified && <span className="muted"> · cleared by {g.verifiedBy}</span>}</td></tr>
            ))}</tbody></table>{!db.gateLog.length && <Empty icon="truck" text="No gate movements yet." />}</div>
        </div>
      </div>
      <div className="card mt">
        <div className="card-head"><h3>Sensitive activity</h3><a className="btn sm ghost" href="#/audit">Full audit trail</a></div>
        {alerts.map((a) => (
          <div className="list-row" key={a.id}>
            <span className={`mini-ic ${a.action === 'Failed login' ? 'red' : 'gold'}`}><Icon name={a.action === 'Failed login' ? 'lock' : 'alert'} /></span>
            <div className="grow small"><b>{a.action}</b> — {a.detail}<div className="muted">{a.userName} · {dateTime(a.ts)}</div></div>
          </div>
        ))}
        {flagged.map((p) => <div className="list-row" key={p.id}><span className="mini-ic red"><Icon name="scale" /></span><div className="grow small"><b>Weight variance on {p.no}</b> — {qty(p.variance)} kg against expected<div className="muted">{p.weighedBy} · {dateTime(p.weighedAt)}</div></div></div>)}
        {!alerts.length && !flagged.length && <Empty icon="shield" text="Nothing sensitive recorded." />}
      </div>
      {entry && <Modal title="Gate entry" onClose={() => setEntry(null)} footer={<><button className="btn" onClick={() => setEntry(null)}>Cancel</button><button className="btn primary" onClick={() => {
        if (!entry.vehicle.trim()) return;
        if (!guard('gate')) return;
        update((d) => { d.gateLog.push({ id: uid('g'), at: nowIso(), ...entry, vehicle: entry.vehicle.trim().toUpperCase(), verified: true, verifiedBy: user.name }); }, ['Gate entry', 'Gate', `${entry.type.toUpperCase()} ${entry.vehicle.toUpperCase()} · ${entry.purpose}`], 'gate');
        toast('Gate entry recorded'); setEntry(null);
      }}>Record</button></>}>
        <div className="grid g2">
          <Field label="Direction"><select className="input" value={entry.type} onChange={(e) => setEntry({ ...entry, type: e.target.value })}><option value="in">In</option><option value="out">Out</option></select></Field>
          <Field label="Vehicle number"><input className="input" autoFocus value={entry.vehicle} onChange={(e) => setEntry({ ...entry, vehicle: e.target.value })} /></Field>
          <Field label="Driver / person"><input className="input" value={entry.driver} onChange={(e) => setEntry({ ...entry, driver: e.target.value })} /></Field>
          <Field label="Purpose"><input className="input" value={entry.purpose} onChange={(e) => setEntry({ ...entry, purpose: e.target.value })} /></Field>
        </div>
      </Modal>}
    </div>
  );
}

