import { useEffect, useState } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { fmtDate, fmtMoney } from '../utils.js';
import { downloadInvoicePdf } from '../invoices/generateInvoicePdf.js';

// Shared by ClientDetailPanel and NormalClientDetailPanel. One click:
// saves a record on the backend (so it has a permanent number and shows
// up later for anyone) and immediately downloads the PDF — no form, no
// extra step. Past invoices are listed below, each regenerated
// client-side from its saved record on download — the PDF itself is
// never stored, just this record.
export default function InvoiceSection({ clientType, clientId, defaultAmount, defaultDescription, billTo }){
  const { call, showToast } = useApp();
  const [invoices, setInvoices] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setInvoices([]);
    call('listInvoices', { clientType, clientId }).then((data) => {
      setInvoices(data.invoices || []);
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientType, clientId]);

  function generate(){
    const amt = Number(defaultAmount) || 0;
    if (amt <= 0){ showToast('No amount to invoice'); return; }
    setBusy(true);
    call('createInvoice', { clientType, clientId, amount: amt, description: defaultDescription || '' }).then((data) => {
      const invoice = data.invoice;
      setInvoices((list) => [invoice, ...list]);
      return downloadInvoicePdf(invoice, billTo);
    }).catch((err) => showToast('Could not create invoice: ' + err.message))
      .finally(() => setBusy(false));
  }

  function redownload(invoice){
    downloadInvoicePdf(invoice, billTo).catch((err) => showToast('Could not build PDF: ' + err.message));
  }

  return (
    <div>
      <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'8px'}}>
        <div style={{fontSize:'.78rem', fontWeight:700, color:'var(--ink-muted)'}}>Invoices</div>
        <button className="btn btn-ghost btn-sm" type="button" onClick={generate} disabled={busy}>{busy ? 'Preparing…' : 'Download invoice'}</button>
      </div>

      {invoices.length === 0
        ? <div className="page-sub">No invoices generated yet.</div>
        : (
          <div className="log-list">
            {invoices.map((inv) => (
              <div className="log-row" key={inv.id} style={{alignItems:'center'}}>
                <div style={{flex:1}}>
                  <div className="log-text">{inv.number} — {fmtMoney(inv.amount)}</div>
                  <div className="log-time">{fmtDate(new Date(inv.issuedAt))}{inv.description ? ' · ' + inv.description : ''}</div>
                </div>
                <button className="btn btn-ghost btn-sm" type="button" onClick={() => redownload(inv)}>Download</button>
              </div>
            ))}
          </div>
        )}
    </div>
  );
}
