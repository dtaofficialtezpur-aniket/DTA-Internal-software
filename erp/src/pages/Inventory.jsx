import { useState } from 'react';
import { useStore } from '../lib/store.jsx';
import { cycleCountDue, isLowStock } from '../lib/calc.js';
import { money, qty, date, dateTime, daysBetween, downloadCsv, nowIso, round2, uid } from '../lib/format.js';
import { moveStock } from '../lib/ops.js';
import { DemoLeft, Empty, Field, HBar, Icon, Modal, PageHead, Stat, Tabs } from '../components/ui.jsx';

export default function Inventory() {
  const { db, user } = useStore();
  const [tab, setTab] = useState('stock');
  const [adjust, setAdjust] = useState(null);
  const low = db.products.filter(isLowStock);
  const due = cycleCountDue(db);
  const canAdjust = ['owner', 'sales_manager', 'warehouse'].includes(user.role);

  return (
    <div className="page">
      <PageHead title="Stock & Cycle Count" sub="Single location (Parua godown). A second location can be added when it opens.">{canAdjust && <DemoLeft kind="adjustment" />}</PageHead>
      <div className="grid g4 stagger">
        <Stat label="Stock value at cost" value={db.products.reduce((s, p) => s + p.stock * p.cost, 0)} icon="layers" />
        <Stat label="Steel on hand" value={db.products.filter((p) => p.baseUnit === 'kg').reduce((s, p) => s + p.stock, 0) / 1000} money={false} sub="metric tonnes" icon="scale" tone="gold" />
        <Stat label="Below reorder level" value={low.length} money={false} icon="alert" tone="red" />
        <Stat label="Due for counting today" value={due.length} money={false} icon="check" tone="green" />
      </div>
      <div className="card mt">
        <div className="card-head wrap">
          <Tabs value={tab} onChange={setTab} items={[['stock', 'Stock levels'], ['count', `Cycle count (${due.length})`], ['ledger', 'Movement ledger']]} />
          {tab === 'ledger' && <button className="btn sm" onClick={() => downloadCsv('stock-ledger.csv', [['Date', 'Item', 'Qty', 'Type', 'Reference'], ...db.stockLedger.map((l) => [date(l.date), db.products.find((p) => p.id === l.productId)?.name, l.qty, l.type, l.ref])])}><Icon name="download" />CSV</button>}
        </div>
        {tab === 'stock' && <StockTable onAdjust={canAdjust ? setAdjust : null} />}
        {tab === 'count' && <CycleCount due={due} />}
        {tab === 'ledger' && <Ledger />}
      </div>
      {adjust && <AdjustModal product={adjust} onClose={() => setAdjust(null)} />}
    </div>
  );
}

function StockTable({ onAdjust }) {
  const { db } = useStore();
  return (
    <div className="table-wrap"><table className="t">
      <thead><tr><th>Item</th><th>Class</th><th className="num">On hand</th><th style={{ width: 180 }}>vs reorder level</th><th className="num">Value</th><th /></tr></thead>
      <tbody>{db.products.map((p) => {
        const ratio = p.reorder ? p.stock / (p.reorder * 3) * 100 : 100;
        return (
          <tr key={p.id}>
            <td><div className="strong">{p.name}</div><div className="small muted">{p.units.map((u) => `${qty(p.stock / u.factor)} ${u.unit}`).join(' · ')}</div></td>
            <td><span className="badge blue">{p.abc}</span></td>
            <td className="num">{qty(p.stock)} {p.baseUnit}</td>
            <td><HBar pct={ratio} tone={isLowStock(p) ? 'red' : ratio < 60 ? 'gold' : ''} /><div className="small muted" style={{ marginTop: 3 }}>Reorder at {qty(p.reorder)}</div></td>
            <td className="num">{money(p.stock * p.cost)}</td>
            <td className="right">{onAdjust && <button className="btn sm" onClick={() => onAdjust(p)}>Adjust</button>}</td>
          </tr>
        );
      })}</tbody>
    </table></div>
  );
}

function CycleCount({ due }) {
  const { db, user, update, toast } = useStore();
  const [counts, setCounts] = useState({});
  const submit = (p) => {
    const counted = Number(counts[p.id]);
    if (counts[p.id] === '' || counts[p.id] == null || Number.isNaN(counted)) return;
    const variance = round2(counted - p.stock);
    update((d) => {
      d.cycleCounts.push({ id: uid('cc'), date: nowIso(), productId: p.id, systemQty: p.stock, countedQty: counted, variance, by: user.name });
      if (variance) moveStock(d, p.id, variance, 'count', 'Cycle count');
    }, ['Cycle count', 'Stock', `${p.name}: system ${qty(p.stock)}, counted ${qty(counted)}, variance ${qty(variance)} ${p.baseUnit}`]);
    toast(variance ? `Variance of ${qty(variance)} ${p.baseUnit} posted` : 'Count matches');
  };
  const recent = db.cycleCounts.slice(-8).reverse();
  return (
    <div className="card-body">
      <div className="alert info" style={{ marginBottom: 14 }}><Icon name="info" /><div>ABC schedule: A items every {db.settings.cycleEvery.A} days, B every {db.settings.cycleEvery.B} days, C every {db.settings.cycleEvery.C} days. Up to {db.settings.cycleDailyLimit} items a day. Counters see the item, not the system quantity.</div></div>
      {due.length ? (
        <table className="t"><thead><tr><th>Item</th><th>Class</th><th>Last counted</th><th className="num">Physical count</th><th /></tr></thead>
          <tbody>{due.map(({ p, last }) => (
            <tr key={p.id}><td className="strong">{p.name}</td><td><span className="badge blue">{p.abc}</span></td><td className="small">{last ? `${date(last)} (${daysBetween(last)} days ago)` : 'Never'}</td>
              <td className="num"><div className="row" style={{ justifyContent: 'flex-end' }}><input className="input sm num" style={{ width: 110 }} value={counts[p.id] ?? ''} onChange={(e) => setCounts({ ...counts, [p.id]: e.target.value.replace(/[^\d.]/g, '') })} /><span className="small">{p.baseUnit}</span></div></td>
              <td className="right"><button className="btn sm primary" onClick={() => submit(p)} disabled={!counts[p.id]}>Submit</button></td></tr>
          ))}</tbody></table>
      ) : <Empty icon="check" text="All counts for today are done." />}
      {recent.length > 0 && <>
        <h3 className="mt" style={{ marginBottom: 8 }}>Recent counts</h3>
        <table className="t"><thead><tr><th>Date</th><th>Item</th><th className="num">System</th><th className="num">Counted</th><th className="num">Variance</th><th>By</th></tr></thead>
          <tbody>{recent.map((c) => { const p = db.products.find((x) => x.id === c.productId); return (
            <tr key={c.id}><td>{dateTime(c.date)}</td><td>{p?.name}</td><td className="num">{qty(c.systemQty)}</td><td className="num">{qty(c.countedQty)}</td>
              <td className="num" style={{ color: c.variance ? 'var(--bad)' : 'var(--ok)' }}>{c.variance > 0 ? '+' : ''}{qty(c.variance)}</td><td>{c.by}</td></tr>); })}</tbody></table>
      </>}
    </div>
  );
}

function Ledger() {
  const { db } = useStore();
  const rows = db.stockLedger.slice(-150).reverse();
  return (
    <div className="table-wrap"><table className="t">
      <thead><tr><th>Date</th><th>Item</th><th>Type</th><th>Reference</th><th className="num">Qty</th></tr></thead>
      <tbody>{rows.map((l) => { const p = db.products.find((x) => x.id === l.productId); return (
        <tr key={l.id}><td>{dateTime(l.date)}</td><td>{p?.name}</td><td><span className={`badge ${l.qty > 0 ? 'ok' : ''}`}>{l.type}</span></td><td className="small">{l.ref}</td>
          <td className="num" style={{ color: l.qty < 0 ? 'var(--bad)' : 'var(--ok)' }}>{l.qty > 0 ? '+' : ''}{qty(l.qty)} {p?.baseUnit}</td></tr>); })}</tbody>
    </table></div>
  );
}

function AdjustModal({ product, onClose }) {
  const { update, toast, guard } = useStore();
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState('Damage');
  const save = () => {
    const n = Number(delta);
    if (!n) return;
    if (!guard('adjustment')) return;
    update((d) => moveStock(d, product.id, n, 'adjust', reason), ['Stock adjustment', 'Stock', `${product.name}: ${n > 0 ? '+' : ''}${n} ${product.baseUnit} (${reason})`], 'adjustment');
    toast('Stock adjusted'); onClose();
  };
  return (
    <Modal title={`Adjust stock — ${product.name}`} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save}>Post adjustment</button></>}>
      <p className="muted small">Current stock {qty(product.stock)} {product.baseUnit}. Use a negative number to reduce stock. Every adjustment is recorded in the audit trail.</p>
      <div className="grid g2 mt">
        <Field label={`Change (${product.baseUnit})`}><input className="input num" autoFocus value={delta} onChange={(e) => setDelta(e.target.value.replace(/[^\d.-]/g, ''))} /></Field>
        <Field label="Reason"><select className="input" value={reason} onChange={(e) => setReason(e.target.value)}>{['Damage', 'Rust / scrap', 'Cutting loss', 'Found in godown', 'Opening correction', 'Other'].map((r) => <option key={r}>{r}</option>)}</select></Field>
      </div>
    </Modal>
  );
}
