import { useEffect, useState } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { fmtDate, fmtMoney } from '../utils.js';

export const PAYMENT_KIND_LABELS = { advance: 'Advance', payment: 'Payment', renewal: 'Subscription renewal', adjustment: 'Advance change' };

// Every amount recorded as received from this client. The admin can remove
// a record that was entered by mistake (e.g. twice); for a normal client that
// also takes it back out of their advance/paid amount.
export default function PaymentsSection({ clientId, refreshKey }){
  const { auth, call, showToast, refreshFromBackend } = useApp();
  const [payments, setPayments] = useState([]);
  const [confirmId, setConfirmId] = useState(null);
  const isAdmin = auth.user.role === 'admin';

  useEffect(() => {
    setConfirmId(null);
    call('listClientPayments', { clientId }).then((d) => setPayments(d.payments || [])).catch(() => setPayments([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, refreshKey]);

  function remove(p){
    if (confirmId !== p.id){ setConfirmId(p.id); return; }
    call('deletePayment', { paymentId: p.id })
      .then(() => { showToast('Payment record removed'); setPayments((list) => list.filter((x) => x.id !== p.id)); setConfirmId(null); return refreshFromBackend(); })
      .catch((err) => showToast('Failed: ' + err.message));
  }

  const total = payments.reduce((t, p) => t + p.amount, 0);

  return (
    <div className="panel-section">
      <div className="section-head">
        <div className="section-head-title">Payments received</div>
        <div className="tabular" style={{fontWeight:700}}>{fmtMoney(total)}</div>
      </div>
      {payments.length === 0
        ? <div className="page-sub">No payments recorded yet.</div>
        : (
          <div className="log-list">
            {payments.map((p) => (
              <div className="log-row" key={p.id} style={{alignItems:'center'}}>
                <div style={{flex:1, minWidth:0}}>
                  <div className="log-text">{PAYMENT_KIND_LABELS[p.kind] || p.kind}</div>
                  <div className="log-time">{fmtDate(new Date(p.paidAt.replace(' ', 'T')))}</div>
                </div>
                <div className="tabular" style={{fontWeight:600, color: p.amount < 0 ? 'var(--crit)' : 'var(--ink)'}}>{fmtMoney(p.amount)}</div>
                {isAdmin && (
                  <button className="btn btn-ghost btn-sm" type="button" onClick={() => remove(p)} title="Remove this payment record">{confirmId === p.id ? 'Confirm?' : 'Remove'}</button>
                )}
              </div>
            ))}
          </div>
        )}
      {isAdmin && payments.length > 0 && <div className="page-sub" style={{marginTop:'6px'}}>Remove a record only if it was entered by mistake (for example twice).</div>}
    </div>
  );
}
