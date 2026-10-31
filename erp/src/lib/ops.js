// Write operations that touch several collections. Each takes the draft db passed to `update`.
import { addDays, nowIso, round2, uid } from './format.js';
import { invoiceDue } from './calc.js';
import { invoiceNo } from './seed.js';

export function moveStock(db, productId, qtyBase, type, ref, cost) {
  const p = db.products.find((x) => x.id === productId);
  if (!p) return;
  p.stock = round2(Number(p.stock) + qtyBase);
  db.stockLedger.push({ id: uid('sl'), date: nowIso(), productId, qty: round2(qtyBase), type, ref, cost });
}

export function postInvoice(db, { bill, customer, payments, userId, sessionId, approval, override }) {
  const no = ++db.seq.INV;
  const at = nowIso();
  const paid = round2(payments.reduce((s, p) => s + Number(p.amount || 0), 0));
  const inv = {
    id: uid('inv'), no: invoiceNo(no, at), date: at, customerId: customer.id, customerName: customer.name, ...bill,
    payments: payments.map((p) => ({ ...p, amount: round2(p.amount) })), paid: Math.min(paid, bill.total),
    dueDate: addDays(at, customer.creditDays || 0), userId, sessionId, approval, override,
    paidAt: paid >= bill.total - 0.5 ? at : null,
  };
  db.invoices.push(inv);
  for (const l of bill.items) moveStock(db, l.productId, -round2(l.qty * l.factor), 'sale', inv.no);

  const pn = ++db.seq.PL;
  db.picklists.push({
    id: uid('pl'), no: 'PL-' + String(pn).padStart(4, '0'), invoiceId: inv.id, date: at, status: 'pending',
    lines: bill.items.map((l) => ({ productId: l.productId, name: l.name, unit: l.unit, qty: l.qty, expectedKg: kgOf(db, l), weighedKg: '' })),
  });
  return inv;
}

// Expected scale weight of a line; non-weight items (cover blocks, electrodes) count as 0.
const kgOf = (db, l) => (db.products.find((p) => p.id === l.productId)?.baseUnit === 'kg' ? round2(l.qty * l.factor) : 0);

// Applies a customer payment to their oldest unpaid invoices first.
export function postReceipt(db, { customerId, amount, mode, ref, userId }) {
  let left = round2(amount);
  const allocations = [];
  const open = db.invoices.filter((i) => i.customerId === customerId && !i.cancelled && invoiceDue(i) > 0.5)
    .sort((a, b) => a.date.localeCompare(b.date));
  for (const inv of open) {
    if (left <= 0) break;
    const take = Math.min(left, invoiceDue(inv));
    inv.paid = round2(inv.paid + take);
    inv.payments.push({ mode, amount: round2(take), ref, at: nowIso() });
    if (invoiceDue(inv) <= 0.5) inv.paidAt = nowIso();
    allocations.push({ invoiceId: inv.id, no: inv.no, amount: round2(take) });
    left = round2(left - take);
  }
  const no = ++db.seq.RC;
  const rc = { id: uid('rc'), no: 'RC-' + String(no).padStart(4, '0'), date: nowIso(), customerId, amount: round2(amount), mode, ref, allocations, advance: left, userId };
  db.receipts.push(rc);
  return rc;
}

export function sessionSummary(db, session) {
  const invs = db.invoices.filter((i) => i.sessionId === session.id && !i.cancelled);
  const byMode = {};
  for (const i of invs) for (const p of i.payments) if (!p.at) byMode[p.mode] = round2((byMode[p.mode] || 0) + p.amount);
  const credit = round2(invs.reduce((s, i) => s + invoiceDue(i), 0));
  return { count: invs.length, total: round2(invs.reduce((s, i) => s + i.total, 0)), byMode, credit, expectedCash: round2(Number(session.openingCash) + (byMode.cash || 0)) };
}
