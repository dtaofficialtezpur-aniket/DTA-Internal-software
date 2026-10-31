// Printable documents: 80 mm thermal receipt, A5 GST tax invoice and godown pick list.
// Each is rendered into a hidden iframe and sent to the browser's print dialog.
import QRCode from 'qrcode';
import { money, date, dateTime, qty, inWords, round2 } from './format.js';
import { upiLink, invoiceDue } from './calc.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function printHtml(html) {
  const f = document.createElement('iframe');
  f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  document.body.appendChild(f);
  const doc = f.contentDocument;
  doc.open();
  doc.write(html);
  doc.close();
  const go = () => {
    f.contentWindow.focus();
    f.contentWindow.print();
    setTimeout(() => f.remove(), 60000);
  };
  // Wait for images and web fonts, but never longer than 2.5 s.
  Promise.race([
    Promise.all([...doc.images].map((i) => i.complete ? 0 : new Promise((r) => { i.onload = i.onerror = r; }))).then(() => doc.fonts?.ready),
    new Promise((r) => setTimeout(r, 2500)),
  ]).then(go);
}

async function upiQr(db, inv) {
  const due = invoiceDue(inv);
  if (!db.company.upiId || due <= 0) return '';
  const src = await QRCode.toDataURL(upiLink(db, due, inv.no), { margin: 0, width: 220 });
  return `<img src="${src}" style="width:90px;height:90px">`;
}

const FONT = `<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;600&family=IBM+Plex+Serif:wght@600&display=swap" rel="stylesheet">`;

export async function printThermal(db, inv) {
  const c = db.company;
  const qr = await upiQr(db, inv);
  const rows = inv.items.map((l) => `
    <tr><td colspan="3">${esc(l.name)}</td></tr>
    <tr class="sub"><td>${qty(l.qty)} ${esc(l.unit)} × ${money(l.rate)}</td><td></td><td class="r">${money(l.taxable)}</td></tr>`).join('');
  printHtml(`<!doctype html><html><head><meta charset="utf-8">${FONT}<style>
    @page { size: 80mm auto; margin: 3mm; }
    body { font-family: 'IBM Plex Sans', sans-serif; font-size: 11px; width: 72mm; margin: 0; color: #000; }
    h1 { font-family: 'IBM Plex Serif', serif; font-size: 15px; text-align: center; margin: 0; }
    .c { text-align: center; } .r { text-align: right; } table { width: 100%; border-collapse: collapse; font-size: inherit; }
    .sub td { padding-bottom: 4px; color: #333; } hr { border: 0; border-top: 1px dashed #000; margin: 6px 0; }
    .tot td { padding: 1px 0; } .big td { font-size: 14px; font-weight: 600; }
  </style></head><body>
    <h1>${esc(c.name)}</h1>
    <div class="c">${esc(c.address)}<br>Ph: ${esc(c.phone)}${c.gstin ? '<br>GSTIN: ' + esc(c.gstin) : ''}</div>
    <hr><div>Bill: <b>${esc(inv.no)}</b><br>Date: ${dateTime(inv.date)}<br>Customer: ${esc(inv.customerName)}</div><hr>
    <table>${rows}</table><hr>
    <table class="tot">
      <tr><td>Taxable value</td><td class="r">${money(inv.taxable)}</td></tr>
      ${inv.interState ? `<tr><td>IGST</td><td class="r">${money(inv.tax)}</td></tr>` : `<tr><td>CGST</td><td class="r">${money(inv.tax / 2)}</td></tr><tr><td>SGST</td><td class="r">${money(inv.tax / 2)}</td></tr>`}
      ${inv.roundOff ? `<tr><td>Round off</td><td class="r">${money(inv.roundOff)}</td></tr>` : ''}
      <tr class="big"><td>TOTAL</td><td class="r">${money(inv.total)}</td></tr>
      ${inv.payments.map((p) => `<tr><td>Paid · ${esc(p.mode.toUpperCase())}</td><td class="r">${money(p.amount)}</td></tr>`).join('')}
      ${invoiceDue(inv) > 0 ? `<tr><td><b>Balance due</b></td><td class="r"><b>${money(invoiceDue(inv))}</b></td></tr>` : ''}
    </table>
    ${qr ? `<hr><div class="c">Scan to pay by UPI<br>${qr}</div>` : ''}
    <hr><div class="c">Thank you for your business.</div>
  </body></html>`);
}

export async function printGstInvoice(db, inv) {
  const c = db.company;
  const cust = db.customers.find((x) => x.id === inv.customerId) || {};
  const qr = await upiQr(db, inv);
  const hsn = {};
  for (const l of inv.items) {
    const h = (hsn[l.hsn + '|' + l.gst] ||= { hsn: l.hsn, rate: l.gst, taxable: 0, tax: 0 });
    h.taxable += l.taxable; h.tax += l.tax;
  }
  const rows = inv.items.map((l, i) => `<tr><td>${i + 1}</td><td>${esc(l.name)}</td><td>${esc(l.hsn)}</td><td class="r">${qty(l.qty)} ${esc(l.unit)}</td>
    <td class="r">${money(l.rate)}</td><td class="r">${l.discount ? money(l.discount) : '—'}</td><td class="r">${money(l.taxable)}</td><td class="r">${l.gst}%</td><td class="r">${money(l.total)}</td></tr>`).join('');
  printHtml(`<!doctype html><html><head><meta charset="utf-8">${FONT}<style>
    @page { size: A5 landscape; margin: 8mm; }
    body { font-family: 'IBM Plex Sans', sans-serif; font-size: 9.5px; color: #111; margin: 0; }
    .hd { display: flex; justify-content: space-between; border-bottom: 2px solid #1c3a6b; padding-bottom: 6px; }
    h1 { font-family: 'IBM Plex Serif', serif; font-size: 18px; margin: 0; color: #1c3a6b; }
    .ttl { text-align: right; } .ttl b { font-size: 13px; letter-spacing: .08em; color: #1c3a6b; }
    .boxes { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 8px 0; }
    .box { border: 1px solid #ccd; padding: 6px 8px; border-radius: 3px; } .box h4 { margin: 0 0 3px; font-size: 8.5px; text-transform: uppercase; letter-spacing: .08em; color: #667; }
    table { width: 100%; border-collapse: collapse; font-size: inherit; } th, td { border: 1px solid #ccd; padding: 3px 5px; } th { background: #eef2f9; font-size: 8.5px; text-transform: uppercase; text-align: left; }
    .r { text-align: right; } .foot { display: grid; grid-template-columns: 1.4fr 1fr; gap: 10px; margin-top: 8px; }
    .tot td { border: 0; padding: 2px 4px; } .grand td { font-size: 12px; font-weight: 600; border-top: 1px solid #111; }
    .sign { margin-top: 26px; text-align: right; font-size: 9px; }
  </style></head><body>
    <div class="hd">
      <div><h1>${esc(c.name)}</h1><div>${esc(c.address)}</div><div>Ph: ${esc(c.phone)} · ${esc(c.email)}</div><div><b>GSTIN:</b> ${esc(c.gstin || '— (to be set)')} · State: ${esc(c.state)} (${esc(c.stateCode)})</div></div>
      <div class="ttl"><b>TAX INVOICE</b><div>No: <b>${esc(inv.no)}</b></div><div>Date: ${date(inv.date)}</div><div>Due: ${date(inv.dueDate)}</div></div>
    </div>
    <div class="boxes">
      <div class="box"><h4>Billed to</h4><b>${esc(cust.name || inv.customerName)}</b><div>${esc(cust.address || '')}</div><div>${cust.gstin ? 'GSTIN: ' + esc(cust.gstin) : 'Unregistered'}</div></div>
      <div class="box"><h4>Place of supply</h4>State code ${esc(cust.stateCode || c.stateCode)} · ${inv.interState ? 'Inter-state (IGST)' : 'Intra-state (CGST + SGST)'}${inv.approval ? `<div>Discount approved by ${esc(inv.approval.byName)}</div>` : ''}</div>
    </div>
    <table><thead><tr><th>#</th><th>Description</th><th>HSN</th><th class="r">Qty</th><th class="r">Rate</th><th class="r">Disc.</th><th class="r">Taxable</th><th class="r">GST</th><th class="r">Amount</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="foot">
      <div>
        <table><thead><tr><th>HSN</th><th class="r">Taxable</th>${inv.interState ? '<th class="r">IGST</th>' : '<th class="r">CGST</th><th class="r">SGST</th>'}</tr></thead><tbody>
        ${Object.values(hsn).map((h) => `<tr><td>${h.hsn} @ ${h.rate}%</td><td class="r">${money(h.taxable)}</td>${inv.interState ? `<td class="r">${money(h.tax)}</td>` : `<td class="r">${money(round2(h.tax / 2))}</td><td class="r">${money(round2(h.tax / 2))}</td>`}</tr>`).join('')}
        </tbody></table>
        <p><b>Amount in words:</b> ${inWords(inv.total)}</p>
        ${c.bank ? `<p><b>Bank:</b> ${esc(c.bank)}</p>` : ''}
      </div>
      <div>
        <table class="tot">
          <tr><td>Gross</td><td class="r">${money(inv.gross)}</td></tr>
          <tr><td>Discount</td><td class="r">− ${money(inv.groupDisc + inv.manualDisc)}</td></tr>
          <tr><td>Taxable value</td><td class="r">${money(inv.taxable)}</td></tr>
          <tr><td>GST</td><td class="r">${money(inv.tax)}</td></tr>
          <tr><td>Round off</td><td class="r">${money(inv.roundOff)}</td></tr>
          <tr class="grand"><td>Invoice total</td><td class="r">${money(inv.total)}</td></tr>
          <tr><td>Received</td><td class="r">${money(inv.paid)}</td></tr>
          <tr><td><b>Balance</b></td><td class="r"><b>${money(invoiceDue(inv))}</b></td></tr>
        </table>
        <div style="display:flex;justify-content:space-between;align-items:end">${qr ? `<div style="font-size:8px">${qr}<br>Scan to pay (UPI)</div>` : '<div></div>'}<div class="sign">For ${esc(c.name)}<br><br><br>Authorised Signatory</div></div>
      </div>
    </div>
  </body></html>`);
}

export function printPicklist(db, pl) {
  const inv = db.invoices.find((i) => i.id === pl.invoiceId);
  printHtml(`<!doctype html><html><head><meta charset="utf-8">${FONT}<style>
    @page { size: A5; margin: 10mm; } body { font-family: 'IBM Plex Sans', sans-serif; font-size: 11px; }
    h1 { font-family: 'IBM Plex Serif', serif; font-size: 17px; margin: 0 0 4px; } table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: inherit; }
    th, td { border: 1px solid #aab; padding: 6px; text-align: left; } .r { text-align: right; } .sig { display: flex; justify-content: space-between; margin-top: 40px; }
  </style></head><body>
    <h1>Pick List ${esc(pl.no)}</h1>
    <div>${esc(db.company.name)} · Bill ${esc(inv?.no)} · ${esc(inv?.customerName)} · ${dateTime(pl.date)}</div>
    ${pl.vehicle ? `<div>Vehicle: <b>${esc(pl.vehicle)}</b> · Driver: ${esc(pl.driver || '')}</div>` : ''}
    <table><thead><tr><th>Item</th><th class="r">Qty</th><th class="r">Expected kg</th><th class="r">Weighed kg</th><th>✓</th></tr></thead><tbody>
      ${pl.lines.map((l) => `<tr><td>${esc(l.name)}</td><td class="r">${qty(l.qty)} ${esc(l.unit)}</td><td class="r">${qty(l.expectedKg)}</td><td class="r">${l.weighedKg ? qty(l.weighedKg) : ''}</td><td></td></tr>`).join('')}
    </tbody></table>
    <div class="sig"><span>Picked by ____________</span><span>Checked by ____________</span><span>Security ____________</span></div>
  </body></html>`);
}

export function printPayslip(db, s) {
  const c = db.company;
  const prof = db.hr.profiles[s.userId] || {};
  const [y, m] = s.month.split('-');
  const label = new Date(+y, +m - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  const row = (a, b) => `<tr><td>${a}</td><td class="r">${b}</td></tr>`;
  printHtml(`<!doctype html><html><head><meta charset="utf-8">${FONT}<style>
    @page { size: A5; margin: 12mm; } body { font-family: 'IBM Plex Sans', sans-serif; font-size: 11px; color: #111; }
    h1 { font-family: 'IBM Plex Serif', serif; font-size: 18px; margin: 0; color: #1c3a6b; } .hd { border-bottom: 2px solid #1c3a6b; padding-bottom: 6px; margin-bottom: 10px; }
    h2 { font-size: 13px; letter-spacing: .08em; text-transform: uppercase; color: #1c3a6b; margin: 0 0 8px; }
    table { width: 100%; border-collapse: collapse; font-size: inherit; margin-bottom: 10px; } td { padding: 5px 6px; border-bottom: 1px solid #dde; } .r { text-align: right; }
    .net td { font-size: 14px; font-weight: 600; border-top: 2px solid #111; } .sig { margin-top: 40px; display: flex; justify-content: space-between; }
  </style></head><body>
    <div class="hd"><h1>${esc(c.name)}</h1><div>${esc(c.address)}</div></div>
    <h2>Salary slip — ${esc(label)}</h2>
    <table>${row('Employee', `<b>${esc(s.name)}</b>`)}${row('Designation', esc(prof.designation || ''))}${row('Bank account', esc(prof.bank || '—'))}</table>
    <table>
      ${row('Monthly salary', money(s.salary))}${row('Working days in month', s.workDays)}${row('Days present', s.presentDays)}
      ${row('Paid leave', s.leave)}${row('Loss-of-pay days', s.lop)}${row(`Loss of pay (${s.lop} × ${money(s.perDay)})`, '− ' + money(round2(s.salary - s.gross)))}
      ${row('Gross earnings', money(s.gross))}
      ${(s.advances || []).map((a) => row(`Advance recovery (${esc(a.reason)})`, '− ' + money(a.amount))).join('')}
      <tr class="net"><td>Net pay</td><td class="r">${money(s.net)}</td></tr>
    </table>
    <div>Amount in words: ${inWords(s.net)}</div>
    <div class="sig"><span>Employee signature</span><span>For ${esc(c.name)}</span></div>
  </body></html>`);
}
