import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '../state/AppContext.jsx';
import { fmtDate, fmtMoney } from '../utils.js';
import { buildInvoicePdf, downloadInvoicePdf } from '../invoices/generateInvoicePdf.js';
import { renderPdfPreview } from '../invoices/renderPdfPreview.js';

// Shared by ClientDetailPanel and NormalClientDetailPanel. "Preview
// invoice" shows exactly what the PDF will look like (nothing is saved
// yet); "Download" in the preview then saves the record on the backend --
// so it gets its permanent number and shows up for everyone later -- and
// downloads the PDF. Past invoices can be previewed or re-downloaded; the
// PDF itself is never stored, just the record, and is rebuilt from it.
export default function InvoiceSection({ clientType, clientId, defaultAmount, defaultDescription, billTo }){
  const { call, showToast } = useApp();
  const [invoices, setInvoices] = useState([]);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null); // { invoice, saved, img }

  useEffect(() => {
    setInvoices([]);
    setPreview(null);
    call('listInvoices', { clientType, clientId }).then((data) => {
      setInvoices(data.invoices || []);
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientType, clientId]);

  async function showPreview(invoice, saved){
    const doc = await buildInvoicePdf(invoice, billTo);
    const img = await renderPdfPreview(doc.output('arraybuffer'));
    setPreview({ invoice, saved, img });
  }

  function previewNew(){
    const amount = Number(defaultAmount) || 0;
    if (amount <= 0){ showToast('No amount to invoice'); return; }
    setBusy(true);
    call('nextInvoiceNumber', { clientId })
      .then((data) => showPreview({
        number: data.number, clientType, clientId, client: billTo.name,
        description: defaultDescription || '', amount, issuedAt: new Date().toISOString(),
      }, false))
      .catch((err) => showToast('Could not build preview: ' + err.message))
      .finally(() => setBusy(false));
  }

  function previewSaved(invoice){
    setBusy(true);
    showPreview(invoice, true)
      .catch((err) => showToast('Could not build preview: ' + err.message))
      .finally(() => setBusy(false));
  }

  function confirmDownload(){
    const { invoice, saved } = preview;
    setBusy(true);
    const work = saved
      ? downloadInvoicePdf(invoice, billTo)
      : call('createInvoice', { clientType, clientId, amount: invoice.amount, description: invoice.description }).then((data) => {
          setInvoices((list) => [data.invoice, ...list]);
          return downloadInvoicePdf(data.invoice, billTo);
        });
    work.then(() => setPreview(null))
      .catch((err) => showToast('Could not download invoice: ' + err.message))
      .finally(() => setBusy(false));
  }

  return (
    <div className="panel-section">
      <div className="section-head">
        <div className="section-head-title">Invoices</div>
        <button className="btn btn-primary btn-sm" type="button" onClick={previewNew} disabled={busy}>{busy && !preview ? 'Preparing…' : 'Preview invoice'}</button>
      </div>

      {invoices.length === 0
        ? <div className="page-sub">No invoices generated yet.</div>
        : (
          <div className="log-list">
            {invoices.map((inv) => (
              <div className="log-row" key={inv.id} style={{alignItems:'center'}}>
                <div style={{flex:1, minWidth:0}}>
                  <div className="log-text">{inv.number} — {fmtMoney(inv.amount)}</div>
                  <div className="log-time">{fmtDate(new Date(inv.issuedAt))}{inv.description ? ' · ' + inv.description : ''}</div>
                </div>
                <button className="btn btn-secondary btn-sm" type="button" disabled={busy} onClick={() => previewSaved(inv)}>Preview</button>
              </div>
            ))}
          </div>
        )}

      {preview && createPortal(
        <div className="modal-wrap open" style={{background:'rgba(0,0,0,.6)'}} onClick={() => !busy && setPreview(null)}>
          <div className="modal" style={{width:'min(680px,100%)'}} onClick={(e) => e.stopPropagation()}>
            <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'12px'}}>
              <h2 style={{fontSize:'1.05rem'}}>Invoice preview — {preview.invoice.number}</h2>
              <button className="btn btn-ghost btn-sm" type="button" aria-label="Close" disabled={busy} onClick={() => setPreview(null)}>✕</button>
            </div>
            <img src={preview.img} alt={'Invoice ' + preview.invoice.number} style={{width:'100%', borderRadius:'6px', background:'#fff', display:'block'}} />
            {!preview.saved && <div className="page-sub" style={{marginTop:'8px'}}>Nothing is saved until you click Download.</div>}
            <div style={{display:'flex', justifyContent:'flex-end', gap:'8px', marginTop:'14px'}}>
              <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => setPreview(null)}>Close</button>
              <button className="btn btn-primary" type="button" disabled={busy} onClick={confirmDownload}>{busy ? 'Preparing…' : 'Download invoice'}</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
