import { useState } from 'react';
import { useStore } from '../lib/store.jsx';
import { landedCost, unitFactor } from '../lib/calc.js';
import { money, qty, date, nowIso, round2, uid } from '../lib/format.js';
import { moveStock } from '../lib/ops.js';
import { ApprovalModal, Empty, Field, Icon, Modal, PageHead, Tabs } from '../components/ui.jsx';

const STATUS = { draft: ['Draft', ''], pending_approval: ['Awaiting approval', 'warn'], approved: ['Approved', 'blue'], received: ['Received', 'ok'], cancelled: ['Cancelled', ''] };
const CHARGES = [['freight', 'Freight'], ['loading', 'Loading'], ['unloading', 'Unloading'], ['insurance', 'Insurance'], ['other', 'Other']];

export default function Purchase() {
  const { db } = useStore();
  const [tab, setTab] = useState('po');
  const [edit, setEdit] = useState(null);
  const [view, setView] = useState(null);
  const [supplier, setSupplier] = useState(null);
  const pos = db.purchaseOrders.slice().reverse();
  const poTotal = (p) => p.items.reduce((s, l) => s + l.qty * l.rate * (1 + l.gst / 100), 0);

  return (
    <div className="page">
      <PageHead title="Purchase & Landed Cost" sub="Every purchase order is approved by the owner before it is placed">
        {tab === 'po' && <button className="btn primary" onClick={() => setEdit({ supplierId: db.suppliers[0]?.id, items: [] })}><Icon name="plus" />New purchase order</button>}
        {tab === 'suppliers' && <button className="btn primary" onClick={() => setSupplier({ name: '', phone: '', gstin: '', address: '' })}><Icon name="plus" />Add supplier</button>}
      </PageHead>
      <div className="card">
        <div className="card-head"><Tabs value={tab} onChange={setTab} items={[['po', 'Purchase orders'], ['suppliers', 'Suppliers']]} /></div>
        {tab === 'po' ? (
          <div className="table-wrap"><table className="t">
            <thead><tr><th>PO</th><th>Date</th><th>Supplier</th><th className="num">Value incl. GST</th><th>Status</th></tr></thead>
            <tbody>{pos.map((p) => (
              <tr key={p.id} className="click" onClick={() => setView(p.id)}>
                <td className="strong">{p.no}</td><td>{date(p.date)}</td><td>{db.suppliers.find((s) => s.id === p.supplierId)?.name}</td>
                <td className="num">{money(poTotal(p))}</td><td><span className={`badge ${STATUS[p.status][1]}`}>{STATUS[p.status][0]}</span></td>
              </tr>
            ))}</tbody>
          </table>{!pos.length && <Empty icon="cart" text="No purchase orders yet." />}</div>
        ) : (
          <div className="table-wrap"><table className="t">
            <thead><tr><th>Supplier</th><th>Phone</th><th>GSTIN</th><th>Address</th><th className="num">Orders</th></tr></thead>
            <tbody>{db.suppliers.map((s) => (
              <tr key={s.id} className="click" onClick={() => setSupplier(s)}><td className="strong">{s.name}</td><td>{s.phone}</td><td className="mono">{s.gstin}</td><td>{s.address}</td><td className="num">{db.purchaseOrders.filter((p) => p.supplierId === s.id).length}</td></tr>
            ))}</tbody>
          </table></div>
        )}
      </div>
      {edit && <PoForm value={edit} onClose={() => setEdit(null)} />}
      {view && <PoView id={view} onClose={() => setView(null)} />}
      {supplier && <SupplierForm value={supplier} onClose={() => setSupplier(null)} />}
    </div>
  );
}

function PoForm({ value, onClose }) {
  const { db, user, update, toast } = useStore();
  const [f, setF] = useState(structuredClone(value));
  const addLine = () => { const p = db.products[0]; setF({ ...f, items: [...f.items, { productId: p.id, name: p.name, unit: p.baseUnit, factor: 1, qty: 0, rate: p.cost, gst: p.gst }] }); };
  const setLine = (i, patch) => setF({ ...f, items: f.items.map((l, j) => {
    if (j !== i) return l;
    const n = { ...l, ...patch };
    const p = db.products.find((x) => x.id === n.productId);
    if (patch.productId) Object.assign(n, { name: p.name, unit: p.baseUnit, factor: 1, rate: p.cost, gst: p.gst });
    if (patch.unit) Object.assign(n, { factor: unitFactor(p, n.unit), rate: round2(p.cost * unitFactor(p, n.unit)) });
    return n;
  }) });
  const total = f.items.reduce((s, l) => s + l.qty * l.rate, 0);
  const save = (submit) => {
    const items = f.items.filter((l) => Number(l.qty) > 0).map((l) => ({ ...l, qty: Number(l.qty), rate: Number(l.rate) }));
    if (!items.length) return toast('Add at least one item', 'bad');
    const po = update((d) => {
      const rec = { ...f, items, status: submit ? 'pending_approval' : 'draft' };
      if (rec.id) { Object.assign(d.purchaseOrders.find((p) => p.id === rec.id), rec); return rec; }
      const n = ++d.seq.PO;
      const full = { ...rec, id: uid('po'), no: 'PO-' + String(n).padStart(4, '0'), date: nowIso(), createdBy: user.id };
      d.purchaseOrders.push(full);
      return full;
    }, [submit ? 'Submitted PO for approval' : 'Saved PO draft', 'Purchase order', `${f.no || 'New PO'} · ${money(total)}`]);
    toast(submit ? `${po.no} sent to the owner for approval` : 'Draft saved');
    onClose();
  };
  return (
    <Modal wide title={f.no ? `Edit ${f.no}` : 'New purchase order'} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn" onClick={() => save(false)}>Save draft</button><button className="btn primary" onClick={() => save(true)}>Submit for approval</button></>}>
      <div className="grid g2">
        <Field label="Supplier"><select className="input" value={f.supplierId} onChange={(e) => setF({ ...f, supplierId: e.target.value })}>{db.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
        <Field label="Channel / note" hint="How the order was placed (phone, WhatsApp, email)"><input className="input" value={f.note || ''} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
      </div>
      <table className="t mt"><thead><tr><th>Item</th><th>Unit</th><th className="num">Qty</th><th className="num">Rate (ex GST)</th><th className="num">Amount</th><th /></tr></thead>
        <tbody>{f.items.map((l, i) => { const p = db.products.find((x) => x.id === l.productId); return (
          <tr key={i}>
            <td><select className="input sm" value={l.productId} onChange={(e) => setLine(i, { productId: e.target.value })}>{db.products.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></td>
            <td><select className="input sm" value={l.unit} onChange={(e) => setLine(i, { unit: e.target.value })}>{[p.baseUnit, ...p.units.map((u) => u.unit)].map((u) => <option key={u}>{u}</option>)}</select></td>
            <td className="num"><input className="input sm num" style={{ width: 100 }} value={l.qty} onChange={(e) => setLine(i, { qty: e.target.value.replace(/[^\d.]/g, '') })} /></td>
            <td className="num"><input className="input sm num" style={{ width: 100 }} value={l.rate} onChange={(e) => setLine(i, { rate: e.target.value.replace(/[^\d.]/g, '') })} /></td>
            <td className="num">{money(l.qty * l.rate)}</td>
            <td><button className="btn ghost icon-btn sm" onClick={() => setF({ ...f, items: f.items.filter((_, j) => j !== i) })} aria-label="Remove"><Icon name="x" /></button></td>
          </tr>); })}</tbody>
        <tfoot><tr><td colSpan={4}>Total before GST</td><td className="num">{money(total)}</td><td /></tr></tfoot>
      </table>
      <button className="btn sm mt" onClick={addLine}><Icon name="plus" />Add item</button>
    </Modal>
  );
}

function PoView({ id, onClose }) {
  const { db, user, update, toast } = useStore();
  const po = db.purchaseOrders.find((p) => p.id === id);
  const [ask, setAsk] = useState(false);
  const [grn, setGrn] = useState(false);
  const [edit, setEdit] = useState(false);
  const sup = db.suppliers.find((s) => s.id === po.supplierId);

  const approve = (a) => {
    update((d) => { Object.assign(d.purchaseOrders.find((p) => p.id === id), { status: 'approved', approvedBy: a.byName, approvedAt: nowIso() }); }, ['Approved purchase order', 'Purchase order', `${po.no} by ${a.byName}`]);
    toast(`${po.no} approved`); setAsk(false);
  };
  const setStatus = (status, label) => { update((d) => { d.purchaseOrders.find((p) => p.id === id).status = status; }, [label, 'Purchase order', po.no]); toast(label); };

  if (edit) return <PoForm value={po} onClose={() => { setEdit(false); onClose(); }} />;
  if (grn) return <GrnModal po={po} onClose={() => { setGrn(false); onClose(); }} />;
  return (
    <Modal wide title={`${po.no} · ${sup?.name}`} onClose={onClose} footer={<>
      {['draft', 'pending_approval', 'approved'].includes(po.status) && <button className="btn danger" onClick={() => setStatus('cancelled', 'Cancelled purchase order')}>Cancel PO</button>}
      <div className="grow" />
      {po.status === 'draft' && <button className="btn" onClick={() => setEdit(true)}><Icon name="edit" />Edit</button>}
      {po.status === 'draft' && <button className="btn primary" onClick={() => setStatus('pending_approval', 'Submitted PO for approval')}>Submit for approval</button>}
      {po.status === 'pending_approval' && <button className="btn primary" onClick={() => setAsk(true)}><Icon name="lock" />Owner approval</button>}
      {po.status === 'approved' && <button className="btn primary" onClick={() => setGrn(true)}><Icon name="truck" />Receive goods</button>}
    </>}>
      <div className="row wrap small muted" style={{ gap: 18 }}>
        <span>Date {date(po.date)}</span><span>Status <span className={`badge ${STATUS[po.status][1]}`}>{STATUS[po.status][0]}</span></span>
        {po.approvedBy && <span>Approved by {po.approvedBy}</span>}{po.note && <span>{po.note}</span>}
      </div>
      <table className="t mt"><thead><tr><th>Item</th><th className="num">Qty</th><th className="num">Rate</th><th className="num">Amount</th>{po.grn && <th className="num">Landed / base unit</th>}</tr></thead>
        <tbody>{po.items.map((l, i) => <tr key={i}><td>{l.name}</td><td className="num">{qty(l.qty)} {l.unit}</td><td className="num">{money(l.rate)}</td><td className="num">{money(l.qty * l.rate)}</td>{po.grn && <td className="num">{money(po.grn.lines[i]?.landedBase)}</td>}</tr>)}</tbody>
      </table>
      {po.grn && <div className="alert ok mt"><Icon name="check" />Received {date(po.grn.date)} against bill {po.grn.billNo}. Charges {money(po.grn.totalCharges)} spread by {po.grn.method}.</div>}
      {ask && <ApprovalModal title={`Approve ${po.no}`} reason={`Purchase from ${sup?.name} worth ${money(po.items.reduce((s, l) => s + l.qty * l.rate, 0))} before GST.`}
        approvers={db.users.filter((u) => u.role === 'owner' && u.active)} onClose={() => setAsk(false)} onApproved={approve} />}
      {user.role !== 'owner' && po.status === 'pending_approval' && <p className="small muted mt">Only the owner can approve purchase orders.</p>}
    </Modal>
  );
}

function GrnModal({ po, onClose }) {
  const { db, update, toast } = useStore();
  const [billNo, setBillNo] = useState('');
  const [received, setReceived] = useState(po.items.map((l) => String(l.qty)));
  const [charges, setCharges] = useState({ freight: '', loading: '', unloading: '', insurance: '', other: '' });
  const [method, setMethod] = useState('weight');

  const lines = po.items.map((l, i) => {
    const p = db.products.find((x) => x.id === l.productId);
    const qtyBase = round2((Number(received[i]) || 0) * l.factor);
    return { productId: l.productId, name: l.name, qtyBase, billedBase: round2(l.qty * l.factor), value: round2(l.qty * l.rate), kgPerBase: p.baseUnit === 'kg' ? 1 : 0, baseUnit: p.baseUnit };
  });
  const result = landedCost(lines, charges, method);
  const totalCharges = Object.values(charges).reduce((s, v) => s + (Number(v) || 0), 0);
  const shortage = lines.reduce((s, l) => s + Math.max(0, l.billedBase - l.qtyBase) * (l.value / (l.billedBase || 1)), 0);

  const post = () => {
    if (!billNo.trim()) return toast('Enter the supplier bill number', 'bad');
    update((d) => {
      for (const l of result) {
        if (!l.qtyBase) continue;
        const p = d.products.find((x) => x.id === l.productId);
        // Weighted average cost with the landed unit cost of this receipt.
        const oldQty = Math.max(0, p.stock);
        p.cost = round2((oldQty * p.cost + l.qtyBase * l.landedBase) / (oldQty + l.qtyBase));
        moveStock(d, l.productId, l.qtyBase, 'purchase', `${po.no} / ${billNo}`, l.landedBase);
      }
      const x = d.purchaseOrders.find((p) => p.id === po.id);
      x.status = 'received';
      x.grn = { no: 'GRN-' + String(++d.seq.GRN).padStart(4, '0'), date: nowIso(), billNo: billNo.trim(), charges, totalCharges, method, shortage: round2(shortage), lines: result };
    }, ['Received goods', 'Purchase order', `${po.no} · bill ${billNo} · charges ${money(totalCharges)} by ${method}${shortage > 0 ? ` · shortage ${money(shortage)}` : ''}`]);
    toast('Goods received, stock and costs updated');
    onClose();
  };

  return (
    <Modal wide title={`Receive goods — ${po.no}`} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={post}><Icon name="check" />Post receipt</button></>}>
      <div className="grid g3">
        <Field label="Supplier bill number"><input className="input" autoFocus value={billNo} onChange={(e) => setBillNo(e.target.value)} /></Field>
        <Field label="Spread charges by"><select className="input" value={method} onChange={(e) => setMethod(e.target.value)}><option value="weight">Weight</option><option value="value">Value</option><option value="qty">Quantity</option></select></Field>
        <Field label="Supplier bill copy" hint="Bill scan (OCR) arrives in the next phase"><input className="input" disabled placeholder="Coming soon" /></Field>
      </div>
      <h3 className="mt" style={{ marginBottom: 8 }}>Additional costs</h3>
      <div className="grid g3" style={{ gridTemplateColumns: 'repeat(5, minmax(0,1fr))' }}>
        {CHARGES.map(([k, l]) => <Field key={k} label={l}><input className="input num" inputMode="decimal" value={charges[k]} onChange={(e) => setCharges({ ...charges, [k]: e.target.value.replace(/[^\d.]/g, '') })} /></Field>)}
      </div>
      <table className="t mt"><thead><tr><th>Item</th><th className="num">Ordered</th><th className="num">Received</th><th className="num">Billed value</th><th className="num">Charges</th><th className="num">Landed cost / unit</th></tr></thead>
        <tbody>{result.map((l, i) => (
          <tr key={i}><td>{l.name}</td><td className="num">{qty(po.items[i].qty)} {po.items[i].unit}</td>
            <td className="num"><input className="input sm num" style={{ width: 100, marginLeft: 'auto' }} value={received[i]} onChange={(e) => setReceived(received.map((v, j) => (j === i ? e.target.value.replace(/[^\d.]/g, '') : v)))} /></td>
            <td className="num">{money(l.value)}</td><td className="num">{money(l.charge)}</td><td className="num strong">{money(l.landedBase)} / {l.baseUnit}</td></tr>
        ))}</tbody>
      </table>
      {shortage > 0.5 && <div className="alert warn mt"><Icon name="alert" />Shortage worth {money(shortage)} (billed but not received) is absorbed into the landed cost. Raise a claim with the supplier if applicable.</div>}
    </Modal>
  );
}

function SupplierForm({ value, onClose }) {
  const { update, toast } = useStore();
  const [f, setF] = useState(value);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = () => {
    if (!f.name.trim()) return;
    update((d) => { if (f.id) Object.assign(d.suppliers.find((s) => s.id === f.id), f); else d.suppliers.push({ ...f, id: uid('s') }); }, [f.id ? 'Edited supplier' : 'Added supplier', 'Supplier', f.name]);
    toast('Supplier saved'); onClose();
  };
  return (
    <Modal title={f.id ? 'Edit supplier' : 'Add supplier'} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save}>Save</button></>}>
      <div className="grid g2">
        <Field label="Name"><input className="input" autoFocus value={f.name} onChange={set('name')} /></Field>
        <Field label="Phone"><input className="input" value={f.phone} onChange={set('phone')} /></Field>
        <Field label="GSTIN"><input className="input" value={f.gstin} onChange={set('gstin')} /></Field>
        <Field label="Address"><input className="input" value={f.address} onChange={set('address')} /></Field>
      </div>
    </Modal>
  );
}
