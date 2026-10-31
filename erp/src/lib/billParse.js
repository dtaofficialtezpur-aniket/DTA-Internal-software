// Turns OCR / PDF text of a supplier bill into structured fields and purchase lines.
import { round2 } from './format.js';

const STOP = new Set(['bar', 'fe', '550d', 'ms', 'mm', 'x', 'g', 'the', 'of', 'packet', 'ismc']);
const num = (s) => Number(String(s).replace(/,/g, ''));

function tokens(name) {
  return [...new Set(name.toLowerCase().replace(/×/g, ' ').replace(/(\d)([a-z])/g, '$1 $2').split(/[^a-z0-9.]+/).filter((t) => t && !STOP.has(t)))];
}

function norm(line) {
  return ' ' + line.toLowerCase().replace(/×/g, ' x ').replace(/(\d)([a-z])/g, '$1 $2').replace(/([a-z])(\d)/g, '$1 $2').replace(/[^a-z0-9.,]+/g, ' ') + ' ';
}

export function matchProduct(products, line) {
  const l = norm(line);
  let best = null;
  for (const p of products) {
    const t = tokens(p.name);
    const hit = t.filter((w) => (/^\d/.test(w) ? new RegExp(`[^\\d.]${w.replace('.', '\\.')}[^\\d.]`).test(l) : l.includes(' ' + w))).length;
    if (hit === t.length && (!best || t.length > best.n)) best = { p, n: t.length };
  }
  return best?.p || null;
}

// Picks quantity and rate on a line: the largest number is the amount; qty × rate should equal it.
function qtyRate(line, product) {
  const skip = new Set(tokens(product.name).filter((t) => /^\d/.test(t)).map(Number));
  const nums = (line.match(/\d[\d,]*\.?\d*/g) || []).map(num).filter((n) => n > 0 && n !== Number(product.hsn));
  const pool = nums.filter((n) => !skip.has(n) || n > 100);
  if (!pool.length) return null;
  const amount = Math.max(...pool);
  const rest = pool.filter((n) => n !== amount);
  for (const q of rest) for (const r of rest) if (q !== r && Math.abs(q * r - amount) <= amount * 0.01 + 1) return { qty: q, rate: r, amount };
  return rest.length ? { qty: rest[0], rate: round2(amount / rest[0]), amount } : null;
}

export function parseBill(text, db) {
  const out = { supplierGstin: '', supplierId: '', billNo: '', billDate: '', total: 0, lines: [] };
  const own = (db.company.gstin || '').toUpperCase();
  const gstins = (text.toUpperCase().match(/\b\d{2}[A-Z]{5}\d{4}[A-Z][0-9A-Z]Z[0-9A-Z]\b/g) || []).filter((g) => g !== own);
  out.supplierGstin = gstins[0] || '';
  const byGst = db.suppliers.find((s) => s.gstin && s.gstin.toUpperCase() === out.supplierGstin);
  const byName = db.suppliers.find((s) => text.toLowerCase().includes(s.name.toLowerCase().split(' ').slice(0, 2).join(' ')));
  out.supplierId = (byGst || byName)?.id || '';
  out.billNo = text.match(/(?:invoice|bill)\s*(?:no|number|#)\.?\s*[:\-]?\s*([A-Z0-9][A-Z0-9/\-]{2,})/i)?.[1] || '';
  const d = text.match(/\b(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})\b/);
  if (d) out.billDate = `${d[3].length === 2 ? '20' + d[3] : d[3]}-${d[2].padStart(2, '0')}-${d[1].padStart(2, '0')}`;
  const totals = [...text.matchAll(/(?:grand\s*total|invoice\s*total|total\s*amount|net\s*amount)[^\d\n]{0,80}([\d,]+\.?\d*)/gi)];
  out.total = totals.length ? num(totals.at(-1)[1]) : 0;

  for (const raw of text.split(/\n/)) {
    const p = matchProduct(db.products, raw);
    if (!p) continue;
    const qr = qtyRate(raw, p);
    if (!qr) continue;
    let { qty, rate } = qr;
    let unit = p.baseUnit;
    // Steel is often billed per tonne.
    if (p.baseUnit === 'kg' && /\b(mt|tonne|ton)s?\b/i.test(raw) && qty < 200) { qty = round2(qty * 1000); rate = round2(rate / 1000); }
    else if (/\bpcs|nos\b/i.test(raw) && p.units.some((u) => u.unit === 'pcs')) unit = 'pcs';
    out.lines.push({ productId: p.id, name: p.name, unit, qty, rate, raw: raw.trim() });
  }
  return out;
}

export const SAMPLE_BILL = `NORTH EAST ISPAT DISTRIBUTORS
G.S. Road, Guwahati, Assam  GSTIN: 18AAAAB0101A1Z5
TAX INVOICE
Invoice No: NEID/2627/1187        Date: 28/10/2026
Bill To: Shanti Trading Company, Tezpur
Sl  Description                 HSN    Qty      Unit  Rate      Amount
1   TMT Bar Fe-550D 12 mm       7214   8.000    MT    58500.00  468000.00
2   TMT Bar Fe-550D 16 mm       7214   5.000    MT    58200.00  291000.00
3   MS Angle 50 x 50 x 5 mm     7216   2.500    MT    61000.00  152500.00
4   Binding Wire 18 G           7217   400      KG    72.00     28800.00
Taxable Value                                                  940300.00
CGST 9%                                                         84627.00
SGST 9%                                                         84627.00
Grand Total                                                   1109554.00`;
