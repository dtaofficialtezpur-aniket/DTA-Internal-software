import { useState } from 'react';
import { useStore } from '../lib/store.jsx';
import { isLowStock } from '../lib/calc.js';
import { money, qty, uid } from '../lib/format.js';
import { Empty, Field, Icon, Modal, PageHead, Search } from '../components/ui.jsx';

export const UNITS = ['kg', 'pcs', 'mtr', 'carton', 'box'];

export default function Products() {
  const { db, user } = useStore();
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState(null);
  const canEdit = ['owner', 'sales_manager'].includes(user.role);
  const list = db.products.filter((p) => (p.name + p.sku + p.category).toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="page">
      <PageHead title="Products & Units" sub="Each item has a base unit for stock and any number of selling units">
        {canEdit && <button className="btn primary" onClick={() => setEdit({ sku: '', name: '', category: 'TMT Rebars', hsn: '', gst: 18, baseUnit: 'kg', units: [], cost: 0, stock: 0, reorder: 0, abc: 'B', active: true })}><Icon name="plus" />Add product</button>}
      </PageHead>
      <div className="card">
        <div className="card-head"><div style={{ width: 300 }}><Search value={q} onChange={setQ} placeholder="Search name, SKU or category" /></div><span className="small muted">{list.length} items</span></div>
        <div className="table-wrap"><table className="t">
          <thead><tr><th>Item</th><th>Category</th><th>HSN · GST</th><th>Units</th><th>ABC</th><th className="num">Stock</th><th className="num">Avg. cost</th></tr></thead>
          <tbody>{list.map((p) => (
            <tr key={p.id} className={canEdit ? 'click' : ''} onClick={() => canEdit && setEdit(p)}>
              <td><div className="strong">{p.name}</div><div className="small muted">{p.sku}</div></td>
              <td>{p.category}</td><td>{p.hsn} · {p.gst}%</td>
              <td className="small">{p.baseUnit}{p.units.map((u) => ` · 1 ${u.unit} = ${u.factor} ${p.baseUnit}`).join('')}</td>
              <td><span className="badge blue">{p.abc}</span></td>
              <td className="num">{qty(p.stock)} {p.baseUnit}{isLowStock(p) && <div><span className="badge bad">Low</span></div>}</td>
              <td className="num">{money(p.cost)}</td>
            </tr>
          ))}</tbody>
        </table>{!list.length && <Empty text="No products found." />}</div>
      </div>
      {edit && <ProductForm value={edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function ProductForm({ value, onClose }) {
  const { update, toast } = useStore();
  const [f, setF] = useState(structuredClone(value));
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = () => {
    if (!f.name.trim()) return;
    const rec = { ...f, gst: Number(f.gst) || 0, cost: Number(f.cost) || 0, reorder: Number(f.reorder) || 0,
      units: f.units.filter((u) => u.unit && u.unit !== f.baseUnit && Number(u.factor) > 0).map((u) => ({ unit: u.unit, factor: Number(u.factor) })) };
    update((d) => {
      if (rec.id) { const p = d.products.find((x) => x.id === rec.id); Object.assign(p, { ...rec, stock: p.stock }); }
      else { const id = uid('p'); d.products.push({ ...rec, id, stock: 0 }); for (const l of d.pricelists) l.prices[id] = 0; }
    }, [rec.id ? 'Edited product' : 'Added product', 'Product', `${rec.name} (${rec.sku})`]);
    toast('Product saved'); onClose();
  };
  return (
    <Modal wide title={f.id ? 'Edit product' : 'Add product'} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save}>Save</button></>}>
      <div className="grid g3">
        <div style={{ gridColumn: 'span 2' }}><Field label="Name"><input className="input" autoFocus value={f.name} onChange={set('name')} /></Field></div>
        <Field label="SKU / code"><input className="input" value={f.sku} onChange={set('sku')} /></Field>
        <Field label="Category"><input className="input" value={f.category} onChange={set('category')} list="cats" /></Field>
        <Field label="HSN code"><input className="input" value={f.hsn} onChange={set('hsn')} /></Field>
        <Field label="GST %"><select className="input" value={f.gst} onChange={set('gst')}>{[0, 5, 12, 18, 28].map((g) => <option key={g}>{g}</option>)}</select></Field>
        <Field label="Base (stock) unit"><select className="input" value={f.baseUnit} onChange={set('baseUnit')} disabled={!!f.id}>{UNITS.map((u) => <option key={u}>{u}</option>)}</select></Field>
        <Field label="Average cost per base unit"><input className="input num" value={f.cost} onChange={set('cost')} /></Field>
        <Field label="Reorder level (base unit)"><input className="input num" value={f.reorder} onChange={set('reorder')} /></Field>
        <Field label="ABC class" hint="A = counted most often"><select className="input" value={f.abc} onChange={set('abc')}>{['A', 'B', 'C'].map((c) => <option key={c}>{c}</option>)}</select></Field>
      </div>
      <datalist id="cats"><option>TMT Rebars</option><option>Steel Structurals</option><option>Allied Products</option></datalist>
      <h3 className="mt" style={{ marginBottom: 8 }}>Alternate units</h3>
      <p className="small muted" style={{ marginBottom: 10 }}>For example, a 12 m TMT bar: 1 pcs = 10.66 kg. Selling in any unit deducts the right base quantity.</p>
      {f.units.map((u, i) => (
        <div className="row" key={i} style={{ marginBottom: 8 }}>
          <span className="small">1</span>
          <select className="input sm" style={{ width: 110 }} value={u.unit} onChange={(e) => setF({ ...f, units: f.units.map((x, j) => (j === i ? { ...x, unit: e.target.value } : x)) })}>{UNITS.filter((x) => x !== f.baseUnit).map((x) => <option key={x}>{x}</option>)}</select>
          <span className="small">=</span>
          <input className="input sm num" style={{ width: 110 }} value={u.factor} onChange={(e) => setF({ ...f, units: f.units.map((x, j) => (j === i ? { ...x, factor: e.target.value } : x)) })} />
          <span className="small">{f.baseUnit}</span>
          <button className="btn ghost icon-btn sm" onClick={() => setF({ ...f, units: f.units.filter((_, j) => j !== i) })} aria-label="Remove unit"><Icon name="x" /></button>
        </div>
      ))}
      <button className="btn sm" onClick={() => setF({ ...f, units: [...f.units, { unit: UNITS.find((x) => x !== f.baseUnit), factor: 1 }] })}><Icon name="plus" />Add unit</button>
    </Modal>
  );
}
