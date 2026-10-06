import { useEffect, useState } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { fmtDate, fmtMoney } from '../utils.js';
import { downloadInvoicePdf } from '../invoices/generateInvoicePdf.js';

// Shared by ClientDetailPanel and NormalClientDetailPanel — "generate"
// saves a record on the backend (so it has a permanent number and shows
// up later for anyone), then immediately builds and downloads the PDF.
// Past invoices are regenerated client-side from their saved data on
// each download — the PDF itself is never stored, just this record.
export default function InvoiceSection({ clientType, clientId, defaultAmount, billTo }){
  const { call, showToast } = useApp();
  const [invoices, setInvoices] = useState([]);
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setInvoices([]);
    call('listInvoices', { clientType, clientId }).then((data) => {
      setInvoices(data.invoices || []);
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientType, clientId]);

  function startGenerate(){
    setAmount(String(defaultAmount || ''));
    setDescription('');
    setOpen(true);
  }

  function generate(e){
    e.preventDefault();
    const amt = Number(amount) || 0;
    if (amt <= 0){ showToast('Enter an amount greater than zero'); return; }
    setBusy(true);
    call('createInvoice', { clientType, clientId, amount: amt, description: description.trim() }).then((data) => {
      const invoice = data.invoice;
      setInvoices((list) => [invoice, ...list]);
      setOpen(false);
      showToast('Invoice ' + invoice.number + ' created');
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
        {!open && <button className="btn btn-ghost btn-sm" type="button" onClick={startGenerate}>Generate invoice</button>}
      </div>

      {open && (
        <form onSubmit={generate} style={{display:'flex', flexDirection:'column', gap:'8px', marginBottom:'10px'}}>
          <input type="number" min="0" step="0.01" placeholder="Amount" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          <input type="text" placeholder="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={255} />
          <div style={{display:'flex', gap:'8px'}}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)} disabled={busy}>Cancel</button>
            <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>{busy ? 'Generating…' : 'Generate & download'}</button>
          </div>
        </form>
      )}

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
