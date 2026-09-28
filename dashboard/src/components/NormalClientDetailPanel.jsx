import { useEffect, useState } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { actionColor, fmtDateTime, fmtMoney } from '../utils.js';

export default function NormalClientDetailPanel(){
  const { normalClients, selectedNormalClientId, setSelectedNormalClientId, call, refreshFromBackend, showToast } = useApp();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(null);
  const [payAmount, setPayAmount] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const open = !!selectedNormalClientId;
  const c = normalClients.find((x) => x.id === selectedNormalClientId);

  useEffect(() => {
    setEditing(false); setConfirmDelete(false); setPayAmount('');
    if (c){
      setForm({ client: c.client, address: c.address || '', contact: c.contact || '', totalAmount: c.totalAmount, advancePayment: c.advancePayment, notes: c.notes || '' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNormalClientId]);

  if (!c || !form) return <aside className={'panel' + (open ? ' open' : '')} aria-label="Client detail" />;

  const remainingPreview = Math.max(0, (Number(form.totalAmount) || 0) - (Number(form.advancePayment) || 0));

  function saveEdit(e){
    e.preventDefault();
    call('updateNormalClient', {
      id: c.id, client: form.client.trim(), address: form.address.trim(), contact: form.contact.trim(),
      totalAmount: Number(form.totalAmount) || 0, advancePayment: Number(form.advancePayment) || 0,
      notes: form.notes.trim(),
    }).then(() => {
      setEditing(false);
      showToast('Client details saved');
      return refreshFromBackend();
    }).catch((err) => showToast('Failed: ' + err.message));
  }

  function recordPayment(e){
    e.preventDefault();
    const amount = Number(payAmount) || 0;
    if (amount <= 0) return;
    call('recordNormalClientPayment', { id: c.id, amount }).then(() => {
      setPayAmount('');
      showToast('Payment recorded for ' + c.client);
      return refreshFromBackend();
    }).catch((err) => showToast('Failed: ' + err.message));
  }

  function del(){
    if (!confirmDelete){ setConfirmDelete(true); return; }
    call('deleteNormalClient', { id: c.id }).then(() => {
      setSelectedNormalClientId(null);
      showToast(c.client + ' removed');
      return refreshFromBackend();
    }).catch((err) => showToast('Failed: ' + err.message));
  }

  return (
    <aside className={'panel' + (open ? ' open' : '')} aria-label="Normal client detail">
      <div className="panel-head">
        <div>
          <div style={{fontSize:'.72rem', color:'var(--ink-faint)', fontWeight:700, textTransform:'uppercase', letterSpacing:'.05em'}}>{c.id}</div>
          <h2 style={{fontSize:'1.1rem', marginTop:'2px'}}>{c.client}</h2>
          <div className="page-sub" style={{marginTop:'2px'}}>Normal client</div>
        </div>
        <button className="btn btn-ghost btn-sm" aria-label="Close" onClick={() => setSelectedNormalClientId(null)}>
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2"><path d="m5 5 10 10M15 5 5 15"/></svg>
        </button>
      </div>
      <div className="panel-body">
        {!editing && (
          <>
            <div>
              <div className="field-row"><span>Address</span><span>{c.address || '—'}</span></div>
              <div className="field-row"><span>Contact</span><span>{c.contact || '—'}</span></div>
              <div className="field-row"><span>Total amount</span><span className="tabular">{fmtMoney(c.totalAmount)}</span></div>
              <div className="field-row"><span>Advance paid</span><span className="tabular">{fmtMoney(c.advancePayment)}</span></div>
              <div className="field-row"><span>Remaining</span><span className="tabular">{fmtMoney(c.remainingPayment)}</span></div>
              {c.notes && <div className="field-row"><span>Notes</span><span>{c.notes}</span></div>}
            </div>

            <div style={{display:'flex', gap:'8px', flexWrap:'wrap'}}>
              <button className="btn btn-secondary btn-sm" type="button" onClick={() => setEditing(true)}>Edit details</button>
              <button className="btn btn-danger btn-sm" type="button" onClick={del}>{confirmDelete ? 'Click again to confirm' : 'Delete client'}</button>
            </div>

            {c.remainingPayment > 0 && (
              <form onSubmit={recordPayment}>
                <div style={{fontSize:'.78rem', fontWeight:700, color:'var(--ink-muted)', marginBottom:'6px'}}>Record a payment</div>
                <div style={{display:'flex', gap:'8px'}}>
                  <input type="number" min="0" step="0.01" placeholder="Amount (₹)" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} style={{flex:1}} />
                  <button type="submit" className="btn btn-primary btn-sm">Add</button>
                </div>
              </form>
            )}
          </>
        )}

        {editing && (
          <form className="settings-form" onSubmit={saveEdit}>
            <label>Client name
              <input required value={form.client} onChange={(e) => setForm({ ...form, client: e.target.value })} />
            </label>
            <label>Address
              <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </label>
            <label>Contact details
              <input value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} />
            </label>
            <label>Total amount (₹)
              <input type="number" min="0" value={form.totalAmount} onChange={(e) => setForm({ ...form, totalAmount: e.target.value })} />
            </label>
            <label>Advance payment (₹)
              <input type="number" min="0" value={form.advancePayment} onChange={(e) => setForm({ ...form, advancePayment: e.target.value })} />
            </label>
            <label>Remaining payment (₹)
              <input type="text" disabled value={'₹' + remainingPreview.toLocaleString('en-IN')} />
            </label>
            <label>Other details
              <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </label>
            <div style={{display:'flex', justifyContent:'flex-end', gap:'8px'}}>
              <button type="button" className="btn btn-ghost" onClick={() => setEditing(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary">Save</button>
            </div>
          </form>
        )}

        <div>
          <div style={{fontSize:'.78rem', fontWeight:700, color:'var(--ink-muted)', marginBottom:'8px'}}>History</div>
          <div className="log-list">
            {c.history.slice().sort((a, b) => b.t - a.t).map((h, i) => (
              <div className="log-row" key={i}>
                <div className="log-dot" style={{background: actionColor(h.action)}} />
                <div><div className="log-text">{h.note}</div><div className="log-time">{fmtDateTime(h.t)}</div></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
}
