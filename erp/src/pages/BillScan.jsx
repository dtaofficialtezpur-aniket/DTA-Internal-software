import { useRef, useState } from 'react';
import { useStore } from '../lib/store.jsx';
import { money, date, nowIso, uid } from '../lib/format.js';
import { parseBill, SAMPLE_BILL } from '../lib/billParse.js';
import { DemoLeft, Empty, Field, Icon, PageHead } from '../components/ui.jsx';

// OCR and PDF engines load from a CDN only when a bill is scanned, keeping the app itself light.
const TESSERACT = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
const PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

const loaded = {};
function loadScript(src) {
  return (loaded[src] ||= new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = () => { delete loaded[src]; rej(new Error('Could not load the scanning engine. Check the internet connection.')); };
    document.head.appendChild(s);
  }));
}

async function ocrImage(src, onProgress) {
  await loadScript(TESSERACT);
  const worker = await window.Tesseract.createWorker('eng', 1, { logger: (m) => m.status === 'recognizing text' && onProgress(Math.round(m.progress * 100)) });
  const { data } = await worker.recognize(src);
  await worker.terminate();
  return data.text;
}

async function readPdf(file, onProgress) {
  await loadScript(PDFJS);
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
  const pdf = await window.pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
  const page = await pdf.getPage(1);
  // Digital PDFs carry text: rebuild lines from text positions. Scanned PDFs fall back to OCR.
  const tc = await page.getTextContent();
  if (tc.items.length > 20) {
    const rows = {};
    for (const it of tc.items) (rows[Math.round(it.transform[5] / 3)] ||= []).push(it);
    return Object.keys(rows).sort((a, b) => b - a).map((k) => rows[k].sort((a, b) => a.transform[4] - b.transform[4]).map((i) => i.str).join('  ')).join('\n');
  }
  const vp = page.getViewport({ scale: 2.5 });
  const canvas = Object.assign(document.createElement('canvas'), { width: vp.width, height: vp.height });
  await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
  return ocrImage(canvas, onProgress);
}

// Draws the sample bill as an image so the demo exercises real OCR.
function sampleImage() {
  const lines = SAMPLE_BILL.split('\n');
  const c = Object.assign(document.createElement('canvas'), { width: 1500, height: 60 + lines.length * 44 });
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#111'; g.font = '26px "Courier New", monospace';
  lines.forEach((l, i) => g.fillText(l, 30, 50 + i * 44));
  return c.toDataURL('image/png');
}

export default function BillScan() {
  const { db, user, update, toast, guard } = useStore();
  const [busy, setBusy] = useState('');
  const [preview, setPreview] = useState('');
  const [text, setText] = useState('');
  const [res, setRes] = useState(null);
  const [fileName, setFileName] = useState('');
  const file = useRef();

  const analyse = (t, name) => { setText(t); setFileName(name); setRes(parseBill(t, db)); };
  const run = async (job, name) => {
    setRes(null); setBusy('Reading bill…');
    try { analyse(await job((p) => setBusy(`Reading bill… ${p}%`)), name); }
    catch (e) { toast(e.message || 'Scan failed', 'bad'); }
    setBusy('');
  };
  const onFile = (f) => {
    if (!f) return;
    if (f.type === 'application/pdf') { setPreview(''); run((p) => readPdf(f, p), f.name); }
    else { const url = URL.createObjectURL(f); setPreview(url); run((p) => ocrImage(url, p), f.name); }
  };
  const setLine = (i, patch) => setRes({ ...res, lines: res.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) });
  const sum = res ? res.lines.reduce((s, l) => s + l.qty * l.rate, 0) : 0;

  const createPo = () => {
    if (!res.supplierId) return toast('Choose the supplier', 'bad');
    if (!res.lines.length) return toast('No items to order', 'bad');
    if (!guard('po')) return;
    const po = update((d) => {
      const n = ++d.seq.PO;
      const items = res.lines.map((l) => {
        const p = d.products.find((x) => x.id === l.productId);
        return { productId: l.productId, name: p.name, unit: l.unit, factor: l.unit === p.baseUnit ? 1 : p.units.find((u) => u.unit === l.unit)?.factor || 1, qty: Number(l.qty), rate: Number(l.rate), gst: p.gst };
      });
      const rec = { id: uid('po'), no: 'PO-' + String(n).padStart(4, '0'), date: nowIso(), supplierId: res.supplierId, status: 'pending_approval', createdBy: user.id, items, note: `From scanned bill ${res.billNo || fileName}`, scannedBill: { billNo: res.billNo, billDate: res.billDate, total: res.total } };
      d.purchaseOrders.push(rec);
      d.billScans.push({ id: uid('bs'), at: nowIso(), by: user.name, file: fileName, billNo: res.billNo, supplierId: res.supplierId, total: res.total, lines: res.lines.length, poNo: rec.no });
      return rec;
    }, ['Scanned supplier bill', 'Purchase order', `${fileName} → ${res.lines.length} items, ${money(sum)}`], 'po');
    toast(`${po.no} created from the bill and sent for owner approval`);
    setRes(null); setText(''); setPreview('');
  };

  return (
    <div className="page">
      <PageHead title="Bill Scan" sub="Photograph or upload a supplier bill; items, quantities and rates are read automatically">
        <DemoLeft kind="po" />
        <button className="btn" onClick={() => { const img = sampleImage(); setPreview(img); run((p) => ocrImage(img, p), 'Sample bill'); }} disabled={!!busy}><Icon name="scan" />Scan sample bill</button>
        <button className="btn primary" onClick={() => file.current.click()} disabled={!!busy}><Icon name="scan" />Upload bill (photo / PDF)</button>
        <input ref={file} type="file" accept="image/*,application/pdf" capture="environment" hidden onChange={(e) => { onFile(e.target.files[0]); e.target.value = ''; }} />
      </PageHead>

      {busy && <div className="card"><div className="card-body row"><div className="spinner" /><div><b>{busy}</b><div className="small muted">The scanning engine downloads once on first use (needs internet).</div></div></div></div>}

      {!busy && !res && (
        <div className="grid g2 stagger">
          <div className="card scan-drop" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); onFile(e.dataTransfer.files[0]); }} onClick={() => file.current.click()}>
            <Icon name="scan" style={{ width: 42, height: 42 }} />
            <h3>Drop a bill here</h3>
            <p className="small muted">JPG, PNG or PDF · on a phone, this opens the camera</p>
          </div>
          <div className="card">
            <div className="card-head"><div><h3>Or paste bill text</h3><p>From an e-mailed invoice or WhatsApp</p></div></div>
            <div className="card-body grid">
              <textarea className="input mono" rows={7} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste the invoice text here" />
              <div className="row"><button className="btn" onClick={() => setText(SAMPLE_BILL)}>Use sample text</button><button className="btn primary" disabled={!text.trim()} onClick={() => analyse(text, 'Pasted text')}>Read items</button></div>
            </div>
          </div>
        </div>
      )}

      {res && (
        <div className="grid g-main stagger">
          <div className="card">
            <div className="card-head"><div><h3>Extracted from {fileName}</h3><p>Check and correct before creating the order</p></div><span className="badge ok">{res.lines.length} item(s) found</span></div>
            <div className="card-body grid g2">
              <Field label="Supplier" hint={res.supplierGstin ? `GSTIN on bill: ${res.supplierGstin}` : 'No GSTIN found'}>
                <select className="input" value={res.supplierId} onChange={(e) => setRes({ ...res, supplierId: e.target.value })}><option value="">Choose…</option>{db.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
              </Field>
              <Field label="Supplier bill no."><input className="input" value={res.billNo} onChange={(e) => setRes({ ...res, billNo: e.target.value })} /></Field>
              <Field label="Bill date"><input className="input" type="date" value={res.billDate} onChange={(e) => setRes({ ...res, billDate: e.target.value })} /></Field>
              <Field label="Bill total (incl. GST)"><input className="input num" value={res.total} onChange={(e) => setRes({ ...res, total: Number(e.target.value.replace(/[^\d.]/g, '')) || 0 })} /></Field>
            </div>
            <div className="table-wrap"><table className="t">
              <thead><tr><th>Item</th><th className="num">Qty</th><th className="num">Rate</th><th className="num">Amount</th><th /></tr></thead>
              <tbody>{res.lines.map((l, i) => (
                <tr key={i}><td><div className="strong small">{l.name}</div><div className="small muted mono" title={l.raw}>{l.raw.slice(0, 60)}</div></td>
                  <td className="num"><div className="row" style={{ justifyContent: 'flex-end' }}><input className="input sm num" style={{ width: 90 }} value={l.qty} onChange={(e) => setLine(i, { qty: e.target.value.replace(/[^\d.]/g, '') })} />{l.unit}</div></td>
                  <td className="num"><input className="input sm num" style={{ width: 90, marginLeft: 'auto' }} value={l.rate} onChange={(e) => setLine(i, { rate: e.target.value.replace(/[^\d.]/g, '') })} /></td>
                  <td className="num">{money(l.qty * l.rate)}</td>
                  <td><button className="btn ghost icon-btn sm" onClick={() => setRes({ ...res, lines: res.lines.filter((_, j) => j !== i) })} aria-label="Remove"><Icon name="x" /></button></td></tr>
              ))}</tbody>
              <tfoot><tr><td colSpan={3}>Taxable value read</td><td className="num">{money(sum)}</td><td /></tr></tfoot>
            </table>{!res.lines.length && <Empty icon="scan" text="No known items were recognised. Check the text on the right, or add the item to Products first." />}</div>
            {res.total > 0 && sum > 0 && <div className="card-body"><div className={`alert ${Math.abs(sum * 1.18 - res.total) < res.total * 0.02 ? 'ok' : 'warn'}`}><Icon name="info" />Items + 18% GST = {money(sum * 1.18)} against bill total {money(res.total)}.</div></div>}
            <div className="card-body row" style={{ justifyContent: 'flex-end', paddingTop: 0 }}>
              <button className="btn" onClick={() => { setRes(null); setPreview(''); }}>Discard</button>
              <button className="btn primary" onClick={createPo}><Icon name="cart" />Create purchase order</button>
            </div>
          </div>
          <div className="card">
            <div className="card-head"><h3>Bill</h3></div>
            {preview && <img src={preview} alt="Scanned bill" style={{ width: '100%', borderBottom: '1px solid var(--line)' }} />}
            <pre className="ocr-text">{text}</pre>
          </div>
        </div>
      )}

      {!res && !busy && db.billScans.length > 0 && (
        <div className="card mt">
          <div className="card-head"><h3>Recent scans</h3></div>
          <table className="t"><thead><tr><th>Scanned</th><th>File</th><th>Supplier</th><th>Bill no.</th><th className="num">Bill total</th><th>Order</th></tr></thead>
            <tbody>{db.billScans.slice().reverse().slice(0, 10).map((b) => <tr key={b.id}><td>{date(b.at)}</td><td>{b.file}</td><td>{db.suppliers.find((s) => s.id === b.supplierId)?.name}</td><td>{b.billNo}</td><td className="num">{money(b.total)}</td><td><a href="#/purchase">{b.poNo}</a></td></tr>)}</tbody></table>
        </div>
      )}
    </div>
  );
}
