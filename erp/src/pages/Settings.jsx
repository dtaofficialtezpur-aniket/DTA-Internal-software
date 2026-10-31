import { useState } from 'react';
import { useStore } from '../lib/store.jsx';
import { ROLES } from '../lib/calc.js';
import { Field, Icon, PageHead } from '../components/ui.jsx';

export default function Settings() {
  const { db, update, toast, resetDemo } = useStore();
  const [c, setC] = useState(db.company);
  const [s, setS] = useState(db.settings);
  const setCo = (k) => (e) => setC({ ...c, [k]: e.target.value });

  const save = () => {
    const settings = {
      ...s,
      discountTiers: s.discountTiers.map((t) => ({ ...t, max: Number(t.max) || 0 })),
      agingBuckets: s.agingBuckets.map(Number).sort((a, b) => a - b),
      reminderEvery: Number(s.reminderEvery) || 7,
      cycleEvery: { A: Number(s.cycleEvery.A) || 7, B: Number(s.cycleEvery.B) || 30, C: Number(s.cycleEvery.C) || 90 },
      cycleDailyLimit: Number(s.cycleDailyLimit) || 6,
    };
    update((d) => { d.company = { ...c, upiId: c.upiId.trim(), gstin: c.gstin.trim().toUpperCase() }; d.settings = settings; }, ['Changed settings', 'Settings', `Discount tiers ${settings.discountTiers.map((t) => `${t.role} ${t.max}%`).join(', ')}`]);
    toast('Settings saved');
  };

  return (
    <div className="page">
      <PageHead title="Settings" sub="Company details, approval limits and schedules">
        <button className="btn primary" onClick={save}><Icon name="check" />Save settings</button>
      </PageHead>
      <div className="grid g2 stagger">
        <div className="card">
          <div className="card-head"><h3>Company</h3></div>
          <div className="card-body grid g2">
            <div style={{ gridColumn: '1 / -1' }}><Field label="Business name"><input className="input" value={c.name} onChange={setCo('name')} /></Field></div>
            <div style={{ gridColumn: '1 / -1' }}><Field label="Address"><input className="input" value={c.address} onChange={setCo('address')} /></Field></div>
            <Field label="Phone"><input className="input" value={c.phone} onChange={setCo('phone')} /></Field>
            <Field label="Email"><input className="input" value={c.email} onChange={setCo('email')} /></Field>
            <Field label="GSTIN" hint="Printed on every GST invoice"><input className="input" value={c.gstin} onChange={setCo('gstin')} /></Field>
            <Field label="State code"><input className="input" value={c.stateCode} onChange={setCo('stateCode')} /></Field>
            <Field label="UPI ID" hint="Used for payment QR codes and links"><input className="input" value={c.upiId} onChange={setCo('upiId')} placeholder="name@bank" /></Field>
            <Field label="Bank details on invoice"><input className="input" value={c.bank} onChange={setCo('bank')} placeholder="Bank, A/c no., IFSC" /></Field>
          </div>
        </div>
        <div className="grid">
          <div className="card">
            <div className="card-head"><div><h3>Discount approval tiers</h3><p>Maximum manual discount each role may give without approval</p></div></div>
            <div className="card-body grid g2">
              {s.discountTiers.map((t, i) => (
                <Field key={t.role} label={ROLES[t.role]}><input className="input num" value={t.max} disabled={t.role === 'owner'} onChange={(e) => setS({ ...s, discountTiers: s.discountTiers.map((x, j) => (j === i ? { ...x, max: e.target.value } : x)) })} /></Field>
              ))}
            </div>
          </div>
          <div className="card">
            <div className="card-head"><h3>Credit & stock schedules</h3></div>
            <div className="card-body grid g3">
              {s.agingBuckets.map((b, i) => <Field key={i} label={`Ageing bucket ${i + 1} (days)`}><input className="input num" value={b} onChange={(e) => setS({ ...s, agingBuckets: s.agingBuckets.map((x, j) => (j === i ? e.target.value : x)) })} /></Field>)}
              <Field label="Reminder every (days)"><input className="input num" value={s.reminderEvery} onChange={(e) => setS({ ...s, reminderEvery: e.target.value })} /></Field>
              {['A', 'B', 'C'].map((k) => <Field key={k} label={`Count ${k} items every (days)`}><input className="input num" value={s.cycleEvery[k]} onChange={(e) => setS({ ...s, cycleEvery: { ...s.cycleEvery, [k]: e.target.value } })} /></Field>)}
              <Field label="Items counted per day"><input className="input num" value={s.cycleDailyLimit} onChange={(e) => setS({ ...s, cycleDailyLimit: e.target.value })} /></Field>
            </div>
            <div className="card-body" style={{ paddingTop: 0 }}>
              <label className="row"><input type="checkbox" checked={s.roundOff} onChange={(e) => setS({ ...s, roundOff: e.target.checked })} /> Round bill totals to the nearest rupee</label>
            </div>
          </div>
          <div className="card">
            <div className="card-head"><div><h3>Demo data</h3><p>The system currently holds sample transactions for demonstration</p></div>
              <button className="btn danger" onClick={() => { if (confirm('Erase everything and reload the sample data? This cannot be undone.')) { resetDemo(); toast('Demo data reloaded'); } }}><Icon name="refresh" />Reset demo</button></div>
          </div>
        </div>
      </div>
    </div>
  );
}
