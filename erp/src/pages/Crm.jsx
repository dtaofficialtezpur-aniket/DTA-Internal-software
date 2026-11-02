import { useState } from 'react';
import { useStore } from '../lib/store.jsx';
import { loyaltyOf, TIERS } from '../lib/calc.js';
import { money, nowIso, uid } from '../lib/format.js';
import { Field, Icon, Modal, PageHead, Search } from '../components/ui.jsx';

export default function LoyaltyPage() {
  return (
    <div className="page">
      <PageHead title="Loyalty Programme" sub="Points earned on every bill and redeemed at the counter" />
      <Loyalty />
    </div>
  );
}

function Loyalty() {
  const { db, user, update, toast } = useStore();
  const [q, setQ] = useState('');
  const [adjust, setAdjust] = useState(null);
  const [rules, setRules] = useState(db.settings.loyalty);
  const members = db.customers.filter((c) => c.id !== 'walkin' && c.name.toLowerCase().includes(q.toLowerCase()))
    .map((c) => ({ c, l: loyaltyOf(db, c.id) })).sort((a, b) => b.l.balance - a.l.balance);
  const liability = members.reduce((s, m) => s + m.l.balance, 0) * db.settings.loyalty.pointValue;
  const canEdit = user.role === 'owner';
  return (
    <div className="grid g-main">
      <div className="card">
        <div className="card-head"><div><h3>Members</h3><p>Outstanding points worth {money(liability)}</p></div><div style={{ width: 240 }}><Search value={q} onChange={setQ} placeholder="Customer" /></div></div>
        <div className="table-wrap"><table className="t">
          <thead><tr><th>Customer</th><th>Tier</th><th className="num">Earned</th><th className="num">Balance</th><th className="num">Worth</th><th /></tr></thead>
          <tbody>{members.map(({ c, l }) => (
            <tr key={c.id}><td className="strong">{c.name}</td><td><span className={`badge ${l.tier === 'Platinum' ? 'blue' : l.tier === 'Gold' ? 'gold' : ''}`}>{l.tier}</span></td>
              <td className="num">{l.earned.toLocaleString('en-IN')}</td><td className="num strong">{l.balance.toLocaleString('en-IN')}</td><td className="num">{money(l.balance * db.settings.loyalty.pointValue)}</td>
              <td className="right">{canEdit && <button className="btn sm" onClick={() => setAdjust({ c, points: '', note: '' })}>Adjust</button>}</td></tr>
          ))}</tbody>
        </table></div>
      </div>
      <div className="card">
        <div className="card-head"><h3>Programme rules</h3></div>
        <div className="card-body grid">
          <label className="row"><input type="checkbox" checked={rules.enabled} disabled={!canEdit} onChange={(e) => setRules({ ...rules, enabled: e.target.checked })} /> Programme active</label>
          <div className="grid g2">
            <Field label="Points per ₹100 billed"><input className="input num" disabled={!canEdit} value={rules.pointsPer100} onChange={(e) => setRules({ ...rules, pointsPer100: e.target.value })} /></Field>
            <Field label="Value of 1 point (₹)"><input className="input num" disabled={!canEdit} value={rules.pointValue} onChange={(e) => setRules({ ...rules, pointValue: e.target.value })} /></Field>
            <Field label="Minimum to redeem"><input className="input num" disabled={!canEdit} value={rules.minRedeem} onChange={(e) => setRules({ ...rules, minRedeem: e.target.value })} /></Field>
          </div>
          <div className="small">{TIERS.slice().reverse().map(([t, min, mult]) => <div key={t} className="row between" style={{ padding: '3px 0' }}><span><b>{t}</b> · from {min.toLocaleString('en-IN')} points earned</span><span>{mult}× points</span></div>)}</div>
          <p className="small muted">Points are earned automatically on every bill for registered customers and can be redeemed at the counter.</p>
          {canEdit && <button className="btn primary" onClick={() => {
            const r = { enabled: rules.enabled, pointsPer100: Number(rules.pointsPer100) || 0, pointValue: Number(rules.pointValue) || 0, minRedeem: Number(rules.minRedeem) || 0 };
            update((d) => { d.settings.loyalty = r; }, ['Changed loyalty rules', 'Settings', `${r.pointsPer100} pts / ₹100, 1 pt = ₹${r.pointValue}`]);
            toast('Loyalty rules saved');
          }}>Save rules</button>}
        </div>
      </div>
      {adjust && <Modal title={`Adjust points — ${adjust.c.name}`} onClose={() => setAdjust(null)} footer={<><button className="btn" onClick={() => setAdjust(null)}>Cancel</button><button className="btn primary" onClick={() => {
        const pts = Math.round(Number(adjust.points));
        if (!pts || !adjust.note.trim()) return toast('Enter points and a reason', 'bad');
        update((d) => { d.loyalty.push({ id: uid('ly'), customerId: adjust.c.id, at: nowIso(), points: pts, ref: 'Manual', note: adjust.note }); }, ['Adjusted loyalty points', 'Loyalty', `${adjust.c.name} · ${pts > 0 ? '+' : ''}${pts} · ${adjust.note}`]);
        toast('Points adjusted'); setAdjust(null);
      }}>Save</button></>}>
        <div className="grid g2">
          <Field label="Points (negative to deduct)"><input className="input num" autoFocus value={adjust.points} onChange={(e) => setAdjust({ ...adjust, points: e.target.value.replace(/[^\d-]/g, '') })} /></Field>
          <Field label="Reason"><input className="input" value={adjust.note} onChange={(e) => setAdjust({ ...adjust, note: e.target.value })} /></Field>
        </div>
      </Modal>}
    </div>
  );
}
