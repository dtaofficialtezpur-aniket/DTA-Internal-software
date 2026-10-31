import { useState } from 'react';
import { useStore } from '../lib/store.jsx';
import { money, uid } from '../lib/format.js';
import { DemoLeft, Empty, Field, Icon, Modal, PageHead, Tabs } from '../components/ui.jsx';

export default function Pricelists() {
  const { db, user, update, toast, guard } = useStore();
  const [tab, setTab] = useState('lists');
  const [sel, setSel] = useState(db.pricelists[0]?.id);
  const [newList, setNewList] = useState(null);
  const [offer, setOffer] = useState(null);
  const [pct, setPct] = useState('');
  const canEdit = ['owner', 'sales_manager'].includes(user.role);
  const list = db.pricelists.find((p) => p.id === sel);

  const setPrice = (pid, v) => update((d) => { d.pricelists.find((p) => p.id === sel).prices[pid] = Number(v) || 0; },
    ['Changed price', 'Pricelist', `${list.name} · ${db.products.find((p) => p.id === pid)?.name} → ${money(v)}`]);

  const bulk = () => {
    const k = Number(pct);
    if (!k) return;
    update((d) => { const l = d.pricelists.find((p) => p.id === sel); for (const id in l.prices) l.prices[id] = Math.round(l.prices[id] * (1 + k / 100) * 100) / 100; },
      ['Bulk price change', 'Pricelist', `${list.name} · ${k > 0 ? '+' : ''}${k}%`]);
    setPct(''); toast(`All prices in ${list.name} changed by ${k}%`);
  };

  const remove = () => {
    if (list.isDefault) return toast('The default pricelist cannot be deleted', 'bad');
    if (db.customerGroups.some((g) => g.pricelistId === sel)) return toast('A customer group still uses this pricelist', 'bad');
    if (!confirm(`Delete pricelist "${list.name}"?`)) return;
    update((d) => { d.pricelists = d.pricelists.filter((p) => p.id !== sel); }, ['Deleted pricelist', 'Pricelist', list.name]);
    setSel(db.pricelists.find((p) => p.id !== sel)?.id);
  };

  return (
    <div className="page">
      <PageHead title="Pricelists & Offers" sub="Rates are per base unit and exclusive of GST">
        {canEdit && <DemoLeft kind={tab === 'lists' ? 'pricelist' : 'offer'} />}
        {canEdit && tab === 'lists' && <button className="btn primary" onClick={() => setNewList({ name: '', copyFrom: sel })}><Icon name="plus" />New pricelist</button>}
        {canEdit && tab === 'offers' && <button className="btn primary" onClick={() => setOffer({ name: '', category: 'TMT Rebars', productId: '', minBase: 0, discPct: 1, from: '', to: '', active: true })}><Icon name="plus" />New offer</button>}
      </PageHead>
      <div className="card">
        <div className="card-head wrap">
          <Tabs value={tab} onChange={setTab} items={[['lists', 'Pricelists'], ['offers', 'Offers & schemes']]} />
          {tab === 'lists' && <div className="row wrap">
            <select className="input" style={{ width: 'auto' }} value={sel} onChange={(e) => setSel(e.target.value)}>{db.pricelists.map((p) => <option key={p.id} value={p.id}>{p.name}{p.isDefault ? ' (default)' : ''}</option>)}</select>
            {canEdit && <><input className="input num" style={{ width: 90 }} placeholder="± %" value={pct} onChange={(e) => setPct(e.target.value.replace(/[^\d.-]/g, ''))} /><button className="btn" onClick={bulk}>Apply to all</button><button className="btn danger" onClick={remove}><Icon name="trash" /></button></>}
          </div>}
        </div>
        {tab === 'lists' ? (
          <div className="table-wrap"><table className="t">
            <thead><tr><th>Item</th><th>Unit</th><th className="num">Cost</th><th className="num">Price</th><th className="num">Margin</th></tr></thead>
            <tbody>{db.products.map((p) => {
              const price = list?.prices[p.id] ?? 0;
              return (
                <tr key={p.id}><td className="strong">{p.name}</td><td>{p.baseUnit}</td><td className="num">{money(p.cost)}</td>
                  <td className="num">{canEdit ? <input key={sel + price} className="input sm num" style={{ width: 110, marginLeft: 'auto' }} defaultValue={price} onBlur={(e) => Number(e.target.value) !== price && setPrice(p.id, e.target.value)} /> : money(price)}</td>
                  <td className="num" style={{ color: price < p.cost ? 'var(--bad)' : undefined }}>{price ? ((price - p.cost) / price * 100).toFixed(1) : 0}%</td></tr>
              );
            })}</tbody>
          </table></div>
        ) : (
          <div className="table-wrap"><table className="t">
            <thead><tr><th>Offer</th><th>Applies to</th><th className="num">Min. qty</th><th className="num">Discount</th><th>Validity</th><th>Status</th><th /></tr></thead>
            <tbody>{(db.offers || []).map((o) => (
              <tr key={o.id}><td className="strong">{o.name}</td><td>{o.productId ? db.products.find((p) => p.id === o.productId)?.name : `All ${o.category}`}</td>
                <td className="num">{o.minBase}</td><td className="num">{o.discPct}%</td><td className="small">{o.from || 'Any'} → {o.to || 'Open'}</td>
                <td><span className={`badge ${o.active ? 'ok' : ''}`}>{o.active ? 'Active' : 'Paused'}</span></td>
                <td className="right">{canEdit && <button className="btn sm" onClick={() => setOffer(o)}><Icon name="edit" />Edit</button>}</td></tr>
            ))}</tbody>
          </table>{!db.offers?.length && <Empty icon="tag" text="No offers yet." />}</div>
        )}
      </div>
      {newList && <Modal title="New pricelist" onClose={() => setNewList(null)} footer={<><button className="btn" onClick={() => setNewList(null)}>Cancel</button><button className="btn primary" onClick={() => {
        if (!newList.name.trim()) return;
        if (!guard('pricelist')) return;
        const id = uid('pl');
        update((d) => { d.pricelists.push({ id, name: newList.name.trim(), prices: { ...(d.pricelists.find((p) => p.id === newList.copyFrom)?.prices || {}) } }); }, ['Created pricelist', 'Pricelist', newList.name], 'pricelist');
        setSel(id); setNewList(null); toast('Pricelist created');
      }}>Create</button></>}>
        <div className="grid">
          <Field label="Name"><input className="input" autoFocus value={newList.name} onChange={(e) => setNewList({ ...newList, name: e.target.value })} /></Field>
          <Field label="Copy prices from"><select className="input" value={newList.copyFrom} onChange={(e) => setNewList({ ...newList, copyFrom: e.target.value })}>{db.pricelists.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
        </div>
      </Modal>}
      {offer && <OfferForm value={offer} onClose={() => setOffer(null)} />}
    </div>
  );
}

function OfferForm({ value, onClose }) {
  const { db, update, toast, guard } = useStore();
  const [f, setF] = useState(value);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const save = () => {
    if (!f.name.trim()) return;
    const rec = { ...f, minBase: Number(f.minBase) || 0, discPct: Number(f.discPct) || 0 };
    if (!rec.id && !guard('offer')) return;
    update((d) => { d.offers ||= []; if (rec.id) Object.assign(d.offers.find((o) => o.id === rec.id), rec); else d.offers.push({ ...rec, id: uid('o') }); },
      [rec.id ? 'Edited offer' : 'Created offer', 'Offer', `${rec.name} · ${rec.discPct}%`], rec.id ? null : 'offer');
    toast('Offer saved'); onClose();
  };
  const del = () => { update((d) => { d.offers = d.offers.filter((o) => o.id !== f.id); }, ['Deleted offer', 'Offer', f.name]); onClose(); };
  return (
    <Modal title={f.id ? 'Edit offer' : 'New offer'} onClose={onClose} footer={<>{f.id && <button className="btn danger" onClick={del}>Delete</button>}<div className="grow" /><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save}>Save</button></>}>
      <div className="grid g2">
        <div style={{ gridColumn: '1 / -1' }}><Field label="Offer name"><input className="input" autoFocus value={f.name} onChange={set('name')} /></Field></div>
        <Field label="Category"><select className="input" value={f.category} onChange={set('category')}>{[...new Set(db.products.map((p) => p.category))].map((c) => <option key={c}>{c}</option>)}</select></Field>
        <Field label="Specific item (optional)"><select className="input" value={f.productId} onChange={set('productId')}><option value="">Whole category</option>{db.products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
        <Field label="Minimum quantity (base unit)"><input className="input num" value={f.minBase} onChange={set('minBase')} /></Field>
        <Field label="Discount %"><input className="input num" value={f.discPct} onChange={set('discPct')} /></Field>
        <Field label="Valid from"><input className="input" type="date" value={f.from} onChange={set('from')} /></Field>
        <Field label="Valid to"><input className="input" type="date" value={f.to} onChange={set('to')} /></Field>
      </div>
      <label className="row mt"><input type="checkbox" checked={f.active} onChange={set('active')} /> Active</label>
    </Modal>
  );
}
