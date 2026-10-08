import { useState } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { fmtMoney } from '../utils.js';

// Converts a client between subscription and normal, in either
// direction. If the client was previously the other type, the backend
// already has its old fields archived and restores them exactly (the
// subscription side even gets its original API key back) — in that
// case this just needs one click. Otherwise it asks for whatever fields
// the new type needs that don't exist on the old one.
export default function ConvertClientSection({ c, direction }){
  const { call, refreshFromBackend, showToast, setSelectedClientId, setSelectedNormalClientId } = useApp();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // Fields only needed going normal -> subscription, when there's no archive.
  const [software, setSoftware] = useState('');
  const [cycle, setCycle] = useState('Monthly');
  const [amount, setAmount] = useState(direction === 'toSubscription' ? String(c.totalAmount || '') : '');
  const [start, setStart] = useState(new Date().toISOString().slice(0, 10));
  const [grace, setGrace] = useState('');

  // Fields only needed going subscription -> normal, when there's no archive.
  const [address, setAddress] = useState('');
  const [contact, setContact] = useState('');
  const [totalAmount, setTotalAmount] = useState(direction === 'toNormal' ? String(c.amount || '') : '');
  const [advancePayment, setAdvancePayment] = useState('0');
  const [notes, setNotes] = useState('');

  const archive = direction === 'toSubscription' ? c.archivedSubscriptionData : c.archivedNormalData;

  function finish(action, extra){
    setBusy(true);
    call(action, { id: c.id, ...extra }).then(() => {
      showToast(c.client + (direction === 'toSubscription' ? ' converted to a subscription client' : ' converted to a normal client'));
      if (direction === 'toSubscription'){
        setSelectedNormalClientId(null);
        return refreshFromBackend().then(() => setSelectedClientId(c.id));
      }
      setSelectedClientId(null);
      return refreshFromBackend().then(() => setSelectedNormalClientId(c.id));
    }).catch((err) => showToast('Could not convert: ' + err.message))
      .finally(() => setBusy(false));
  }

  function beginConvert(){
    if (archive){
      // Exact restore — the backend ignores any body fields when an archive exists.
      finish(direction === 'toSubscription' ? 'convertToSubscription' : 'convertToNormal', {});
    } else {
      setOpen(true);
    }
  }

  function submitToSubscription(e){
    e.preventDefault();
    const amt = Number(amount) || 0;
    if (!software.trim()){ showToast('Software name is required'); return; }
    if (amt <= 0){ showToast('Plan amount must be greater than zero'); return; }
    finish('convertToSubscription', {
      software: software.trim(), cycle, amount: amt, start,
      grace: grace === '' ? undefined : Number(grace),
    });
  }

  function submitToNormal(e){
    e.preventDefault();
    const total = Number(totalAmount) || 0;
    const advance = Number(advancePayment) || 0;
    if (advance > total){ showToast('Advance payment cannot be more than the total amount'); return; }
    finish('convertToNormal', {
      address: address.trim(), contact: contact.trim(),
      totalAmount: total, advancePayment: advance, notes: notes.trim(),
    });
  }

  return (
    <div>
      <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'8px'}}>
        <div style={{fontSize:'.78rem', fontWeight:700, color:'var(--ink-muted)'}}>Client type</div>
        {!open && (
          <button className="btn btn-ghost btn-sm" type="button" disabled={busy} onClick={beginConvert}>
            {direction === 'toSubscription' ? 'Convert to subscription client' : 'Convert to normal client'}
          </button>
        )}
      </div>

      {archive && direction === 'toSubscription' && (
        <div className="page-sub">Was a subscription client before — {archive.software}, {fmtMoney(archive.amount)}/{archive.cycle === 'Monthly' ? 'mo' : 'yr'}. Converting back restores this, including the same API key.</div>
      )}
      {archive && direction === 'toNormal' && (
        <div className="page-sub">Was a normal client before — total {fmtMoney(archive.totalAmount)}, advance {fmtMoney(archive.advancePayment)}. Converting back restores this.</div>
      )}
      {!archive && !open && (
        <div className="page-sub">{direction === 'toSubscription' ? 'Never was a subscription client — converting will ask for software/plan details.' : 'Never was a normal client — converting will ask for contact/payment details.'}</div>
      )}

      {open && direction === 'toSubscription' && (
        <form onSubmit={submitToSubscription}>
          <div className="form-grid">
            <label className="full">Software name
              <input type="text" autoComplete="off" required maxLength={255} value={software} onChange={(e) => setSoftware(e.target.value)} />
            </label>
            <label>Plan amount (₹)
              <input type="number" min="0.01" step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} />
            </label>
            <label>Billing cycle
              <select value={cycle} onChange={(e) => setCycle(e.target.value)}>
                <option value="Monthly">Monthly</option>
                <option value="Annual">Annual</option>
              </select>
            </label>
            <label>Start date
              <input type="date" required value={start} onChange={(e) => setStart(e.target.value)} />
            </label>
            <label>Grace period (days)
              <input type="number" min="0" placeholder="default" value={grace} onChange={(e) => setGrace(e.target.value)} />
            </label>
          </div>
          <div style={{display:'flex', justifyContent:'flex-end', gap:'8px', marginTop:'10px'}}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)} disabled={busy}>Cancel</button>
            <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>{busy ? 'Converting…' : 'Convert'}</button>
          </div>
        </form>
      )}

      {open && direction === 'toNormal' && (
        <form onSubmit={submitToNormal}>
          <div className="form-grid">
            <label className="full">Address
              <input type="text" autoComplete="off" maxLength={2000} value={address} onChange={(e) => setAddress(e.target.value)} />
            </label>
            <label className="full">Contact details
              <input type="text" autoComplete="off" maxLength={255} value={contact} onChange={(e) => setContact(e.target.value)} />
            </label>
            <label>Total amount (₹)
              <input type="number" min="0" step="0.01" value={totalAmount} onChange={(e) => setTotalAmount(e.target.value)} />
            </label>
            <label>Advance payment (₹)
              <input type="number" min="0" step="0.01" max={totalAmount || undefined} value={advancePayment} onChange={(e) => setAdvancePayment(e.target.value)} />
            </label>
          </div>
          <div style={{display:'flex', justifyContent:'flex-end', gap:'8px', marginTop:'10px'}}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)} disabled={busy}>Cancel</button>
            <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>{busy ? 'Converting…' : 'Convert'}</button>
          </div>
        </form>
      )}
    </div>
  );
}
