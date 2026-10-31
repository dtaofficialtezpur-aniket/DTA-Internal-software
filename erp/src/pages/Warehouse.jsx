import { useState } from 'react';
import { useStore } from '../lib/store.jsx';
import { qty, dateTime, nowIso, round2, uid } from '../lib/format.js';
import { printPicklist } from '../lib/print.js';
import { Empty, Field, Icon, Modal, PageHead } from '../components/ui.jsx';

const FLOW = [['pending', 'To pick', ''], ['weighed', 'Weighed', 'warn'], ['dispatched', 'Dispatched', 'ok']];
// Weight differences beyond this share of the expected weight are flagged for review.
const TOLERANCE = 0.02;

export default function Warehouse() {
  const { db } = useStore();
  const [open, setOpen] = useState(null);
  const lists = db.picklists.filter((p) => p.status !== 'cancelled');
  return (
    <div className="page">
      <PageHead title="Warehouse Orders" sub="Every bill creates a pick list. Load on the weigh scale, record the weight, then dispatch." />
      <div className="grid g3 stagger">
        {FLOW.map(([k, label, tone]) => {
          const items = lists.filter((p) => p.status === k).slice(k === 'dispatched' ? -8 : 0).reverse();
          return (
            <div className="card" key={k}>
              <div className="card-head"><h3>{label}</h3><span className={`badge ${tone || 'blue'}`}>{lists.filter((p) => p.status === k).length}</span></div>
              <div className="grid" style={{ padding: 12, gap: 10 }}>
                {items.map((p) => {
                  const inv = db.invoices.find((i) => i.id === p.invoiceId);
                  return (
                    <button key={p.id} className="prod" onClick={() => setOpen(p.id)}>
                      <div className="row between"><b>{p.no}</b><span className="small muted">{dateTime(p.date)}</span></div>
                      <div className="small" style={{ marginTop: 4 }}>{inv?.customerName} · {inv?.no}</div>
                      <div className="small muted" style={{ marginTop: 4 }}>{p.lines.length} item(s) · {qty(p.lines.reduce((s, l) => s + l.expectedKg, 0))} kg expected</div>
                      {p.flag && <div className="small" style={{ color: 'var(--bad)', marginTop: 4 }}>Weight variance flagged</div>}
                      {p.vehicle && <div className="small" style={{ marginTop: 4 }}>Vehicle {p.vehicle}</div>}
                    </button>
                  );
                })}
                {!items.length && <Empty icon="truck" text="Nothing here." />}
              </div>
            </div>
          );
        })}
      </div>
      {open && <PickModal id={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function PickModal({ id, onClose }) {
  const { db, user, update, toast } = useStore();
  const pl = db.picklists.find((p) => p.id === id);
  const inv = db.invoices.find((i) => i.id === pl.invoiceId);
  const [weights, setWeights] = useState(Object.fromEntries(pl.lines.map((l, i) => [i, l.weighedKg])));
  const [vehicle, setVehicle] = useState(pl.vehicle || '');
  const [driver, setDriver] = useState(pl.driver || '');
  const expected = pl.lines.reduce((s, l) => s + l.expectedKg, 0);
  const weighed = Object.values(weights).reduce((s, v) => s + (Number(v) || 0), 0);
  const variance = round2(weighed - expected);
  const flagged = Math.abs(variance) > expected * TOLERANCE;

  const saveWeights = () => {
    update((d) => {
      const p = d.picklists.find((x) => x.id === id);
      p.lines.forEach((l, i) => { l.weighedKg = Number(weights[i]) || 0; });
      Object.assign(p, { status: 'weighed', weighedAt: nowIso(), weighedBy: user.name, flag: flagged, variance });
    }, ['Weighed order', 'Pick list', `${pl.no}: expected ${qty(expected)} kg, weighed ${qty(weighed)} kg${flagged ? ' — FLAGGED' : ''}`]);
    toast(flagged ? 'Weight recorded — variance flagged for review' : 'Weight recorded');
    onClose();
  };
  const dispatch = () => {
    if (!vehicle.trim()) return;
    update((d) => {
      const p = d.picklists.find((x) => x.id === id);
      Object.assign(p, { status: 'dispatched', dispatchedAt: nowIso(), dispatchedBy: user.name, vehicle: vehicle.trim().toUpperCase(), driver });
      d.gateLog.push({ id: uid('g'), at: nowIso(), type: 'out', vehicle: vehicle.trim().toUpperCase(), driver, picklistId: id, ref: `${p.no} / ${inv?.no}`, kg: weighed || expected, verified: false });
    }, ['Dispatched order', 'Pick list', `${pl.no} on ${vehicle.toUpperCase()}`]);
    toast('Dispatched — gate pass sent to security');
    onClose();
  };
  const editable = pl.status === 'pending' || (pl.status === 'weighed' && ['owner', 'sales_manager', 'warehouse'].includes(user.role));

  return (
    <Modal wide title={`Pick list ${pl.no}`} onClose={onClose} footer={<>
      <button className="btn" onClick={() => printPicklist(db, { ...pl, vehicle, driver })}><Icon name="print" />Print</button>
      <div className="grow" />
      {pl.status !== 'dispatched' && editable && <button className="btn" onClick={saveWeights}><Icon name="scale" />Save weights</button>}
      {pl.status === 'weighed' && <button className="btn primary" onClick={dispatch} disabled={!vehicle.trim()}><Icon name="truck" />Dispatch</button>}
    </>}>
      <p className="muted">{inv?.customerName} · {inv?.no} · {dateTime(pl.date)}</p>
      <table className="t mt"><thead><tr><th>Item</th><th className="num">Qty</th><th className="num">Expected kg</th><th className="num">Weighed kg</th></tr></thead>
        <tbody>{pl.lines.map((l, i) => (
          <tr key={i}><td className="strong">{l.name}</td><td className="num">{qty(l.qty)} {l.unit}</td><td className="num">{qty(l.expectedKg)}</td>
            <td className="num">{pl.status === 'dispatched' || !editable ? qty(l.weighedKg) : <input className="input sm num" style={{ width: 110, marginLeft: 'auto' }} inputMode="decimal" value={weights[i] ?? ''} onChange={(e) => setWeights({ ...weights, [i]: e.target.value.replace(/[^\d.]/g, '') })} />}</td></tr>
        ))}</tbody>
        <tfoot><tr><td colSpan={2}>Total</td><td className="num">{qty(expected)}</td><td className="num">{qty(weighed)}</td></tr></tfoot>
      </table>
      {weighed > 0 && <div className={`alert mt ${flagged ? 'bad' : 'ok'}`}><Icon name={flagged ? 'alert' : 'check'} />Variance {variance > 0 ? '+' : ''}{qty(variance)} kg ({expected ? (variance / expected * 100).toFixed(2) : 0}%). Tolerance ±{TOLERANCE * 100}%.</div>}
      <div className="alert info mt small"><Icon name="info" />Weigh-scale integration: weights are typed in for now. A direct connection to the scale can be added once the scale model and connection type (USB, serial or Bluetooth) are confirmed.</div>
      {pl.status !== 'pending' && (
        <div className="grid g2 mt">
          <Field label="Vehicle number"><input className="input" value={vehicle} onChange={(e) => setVehicle(e.target.value)} disabled={pl.status === 'dispatched'} placeholder="AS 12 AB 1234" /></Field>
          <Field label="Driver"><input className="input" value={driver} onChange={(e) => setDriver(e.target.value)} disabled={pl.status === 'dispatched'} /></Field>
        </div>
      )}
    </Modal>
  );
}
