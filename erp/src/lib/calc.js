// Pure business rules: pricing, GST, discount approval, credit, aging, landed cost.
import { round2, daysBetween, nowIso } from './format.js';

export const ROLES = {
  owner: 'Owner',
  sales_manager: 'Sales Manager',
  cashier: 'Cashier / Billing',
  salesman: 'Salesman',
  accounts: 'Accounts',
  warehouse: 'Godown / Warehouse',
  delivery: 'Delivery',
  security: 'Security',
};

// Which modules each role can open.
export const ACCESS = {
  owner: '*',
  sales_manager: ['dashboard', 'pos', 'sales', 'customers', 'collections', 'pricelists', 'crm', 'products', 'inventory', 'warehouse', 'reports', 'me'],
  cashier: ['pos', 'sales', 'customers', 'collections', 'me'],
  salesman: ['pos', 'sales', 'customers', 'collections', 'crm', 'me'],
  accounts: ['dashboard', 'sales', 'customers', 'collections', 'purchase', 'scan', 'bank', 'hr', 'reports', 'me'],
  warehouse: ['warehouse', 'inventory', 'products', 'me'],
  delivery: ['warehouse', 'me'],
  security: ['security', 'warehouse', 'me'],
};

export const canOpen = (role, page) => ACCESS[role] === '*' || (ACCESS[role] || []).includes(page);

export const unitFactor = (product, unit) =>
  unit === product.baseUnit ? 1 : (product.units.find((u) => u.unit === unit)?.factor || 1);

// Price per base unit for a customer: their group's pricelist, falling back to the default list.
export function basePrice(db, product, customer) {
  const group = customer && db.customerGroups.find((g) => g.id === customer.groupId);
  const list = db.pricelists.find((p) => p.id === group?.pricelistId);
  const def = db.pricelists.find((p) => p.isDefault) || db.pricelists[0];
  return Number(list?.prices[product.id] ?? def?.prices[product.id] ?? 0);
}

export function groupDiscount(db, customer) {
  const group = customer && db.customerGroups.find((g) => g.id === customer.groupId);
  return Number(group?.discount || 0);
}

// Builds a full bill from cart lines. Rates are GST-exclusive.
export function computeBill({ lines, billDiscPct = 0, groupDiscPct = 0, interState = false, roundOff = true }) {
  let gross = 0, manualDisc = 0, groupDisc = 0, taxable = 0, tax = 0;
  const items = lines.map((l) => {
    const amount = round2(l.qty * l.rate);
    const gDisc = round2(amount * (groupDiscPct + (l.offerPct || 0)) / 100);
    const iDisc = round2((amount - gDisc) * (l.discPct || 0) / 100);
    const afterItem = amount - gDisc - iDisc;
    const bDisc = round2(afterItem * billDiscPct / 100);
    const t = round2(afterItem - bDisc);
    const g = round2(t * l.gst / 100);
    gross += amount; groupDisc += gDisc; manualDisc += iDisc + bDisc; taxable += t; tax += g;
    return { ...l, amount, discount: round2(gDisc + iDisc + bDisc), taxable: t, tax: g,
      cgst: interState ? 0 : round2(g / 2), sgst: interState ? 0 : round2(g / 2), igst: interState ? g : 0, total: round2(t + g) };
  });
  const raw = round2(taxable + tax);
  const total = roundOff ? Math.round(raw) : raw;
  return {
    items, gross: round2(gross), groupDisc: round2(groupDisc), manualDisc: round2(manualDisc),
    // Manual discount as a share of the bill after group pricing; this is what the approval tiers check.
    manualDiscPct: gross - groupDisc > 0 ? round2(manualDisc / (gross - groupDisc) * 100) : 0,
    taxable: round2(taxable), tax: round2(tax), roundOff: round2(total - raw), total, interState,
  };
}

export const discountLimit = (db, role) => Number(db.settings.discountTiers.find((t) => t.role === role)?.max ?? 0);

// Users allowed to approve a given discount %.
export const approversFor = (db, pct) =>
  db.users.filter((u) => u.active && discountLimit(db, u.role) >= pct && ['owner', 'sales_manager'].includes(u.role));

export const invoiceDue = (inv) => round2(inv.total - (inv.paid || 0));

export function customerLedger(db, customerId) {
  const invs = db.invoices.filter((i) => i.customerId === customerId && !i.cancelled);
  const outstanding = round2(invs.reduce((s, i) => s + invoiceDue(i), 0));
  const overdue = invs.filter((i) => invoiceDue(i) > 0.5 && new Date(i.dueDate) < new Date());
  const overdueAmt = round2(overdue.reduce((s, i) => s + invoiceDue(i), 0));
  return { invs, outstanding, overdue, overdueAmt };
}

// Credit block: credit billing is refused when it would cross the limit or an invoice is overdue.
export function creditCheck(db, customer, newCredit) {
  if (!customer) return { ok: false, reason: 'Credit sale needs a registered customer.' };
  const { outstanding, overdue, overdueAmt } = customerLedger(db, customer.id);
  if (overdue.length) return { ok: false, reason: `${overdue.length} overdue invoice(s) totalling ₹${overdueAmt.toLocaleString('en-IN')}.` };
  if (outstanding + newCredit > Number(customer.creditLimit || 0))
    return { ok: false, reason: `Credit limit ₹${Number(customer.creditLimit || 0).toLocaleString('en-IN')} would be exceeded (outstanding ₹${outstanding.toLocaleString('en-IN')}).` };
  return { ok: true };
}

export function agingBuckets(db, invoices) {
  const [a, b, c] = db.settings.agingBuckets;
  const out = { current: 0, [`1-${a}`]: 0, [`${a + 1}-${b}`]: 0, [`${b + 1}-${c}`]: 0, [`${c}+`]: 0 };
  for (const i of invoices) {
    const due = invoiceDue(i);
    if (due <= 0.5) continue;
    const late = daysBetween(i.dueDate);
    if (late <= 0) out.current += due;
    else if (late <= a) out[`1-${a}`] += due;
    else if (late <= b) out[`${a + 1}-${b}`] += due;
    else if (late <= c) out[`${b + 1}-${c}`] += due;
    else out[`${c}+`] += due;
  }
  return out;
}

// Dynamic credit score (0-100) from payment punctuality, limit utilisation, overdue exposure and history.
export function creditScore(db, customer) {
  const { invs, outstanding, overdueAmt } = customerLedger(db, customer.id);
  if (!invs.length) return { score: 60, grade: 'B', note: 'No history yet' };
  const settled = invs.filter((i) => i.paidAt);
  const avgLate = settled.length
    ? settled.reduce((s, i) => s + Math.max(0, daysBetween(i.dueDate, i.paidAt)), 0) / settled.length : 0;
  const punctuality = Math.max(0, 35 - avgLate * 1.5);
  const limit = Number(customer.creditLimit) || 1;
  const utilisation = Math.max(0, 25 * (1 - Math.min(1, outstanding / limit)));
  const exposure = outstanding > 0 ? Math.max(0, 25 * (1 - overdueAmt / outstanding)) : 25;
  const history = Math.min(15, invs.length * 1.5);
  // Any overdue invoice caps the score below grade A; long overdue drops it further.
  const worstLate = Math.max(0, ...customerLedger(db, customer.id).overdue.map((i) => daysBetween(i.dueDate)));
  const cap = overdueAmt > 0 ? Math.max(20, 74 - worstLate) : 100;
  const score = Math.min(cap, Math.round(punctuality + utilisation + exposure + history));
  const grade = score >= 80 ? 'A' : score >= 65 ? 'B' : score >= 45 ? 'C' : 'D';
  return { score, grade, note: `Avg ${avgLate.toFixed(0)} days late · ${Math.round(outstanding / limit * 100)}% limit used` };
}

// Spreads purchase charges over received lines by value, weight or quantity.
// Lines carry the billed value, so any shortage (billed but not received) also lifts the unit cost.
export function landedCost(lines, charges, method) {
  const totalCharges = Object.values(charges).reduce((s, v) => s + (Number(v) || 0), 0);
  let basis = lines.map((l) => method === 'value' ? l.value : method === 'weight' ? l.qtyBase * (l.kgPerBase || 0) : l.qtyBase);
  // Nothing weighable (or no value) received: fall back to quantity so charges are never lost.
  if (!basis.some((v) => v > 0)) basis = lines.map((l) => l.qtyBase);
  const sum = basis.reduce((s, v) => s + v, 0) || 1;
  return lines.map((l, i) => {
    const charge = round2(totalCharges * basis[i] / sum);
    return { ...l, charge, landedBase: l.qtyBase > 0 ? round2((l.value + charge) / l.qtyBase) : 0 };
  });
}

// ABC cycle counting: A items every few days, B monthly, C quarterly; oldest first, capped per day.
export function cycleCountDue(db) {
  const every = db.settings.cycleEvery;
  const lastCount = {};
  for (const c of db.cycleCounts) if (!lastCount[c.productId] || c.date > lastCount[c.productId]) lastCount[c.productId] = c.date;
  return db.products
    .filter((p) => p.active !== false)
    .map((p) => ({ p, last: lastCount[p.id], age: lastCount[p.id] ? daysBetween(lastCount[p.id]) : 9999 }))
    .filter((x) => x.age >= (every[x.p.abc] || 30))
    .sort((x, y) => (x.p.abc > y.p.abc ? 1 : x.p.abc < y.p.abc ? -1 : y.age - x.age))
    .slice(0, db.settings.cycleDailyLimit);
}

// Best active offer for a cart line (slab on quantity in base units, by product or category).
export function offerFor(db, product, qtyBase) {
  const now = new Date().toISOString().slice(0, 10);
  return (db.offers || [])
    .filter((o) => o.active && (!o.from || o.from <= now) && (!o.to || o.to >= now))
    .filter((o) => (o.productId ? o.productId === product.id : o.category === product.category) && qtyBase >= Number(o.minBase || 0))
    .sort((a, b) => b.discPct - a.discPct)[0] || null;
}

export const isLowStock = (p) => Number(p.stock) <= Number(p.reorder || 0);

export function upiLink(db, amount, note) {
  const c = db.company;
  return `upi://pay?pa=${encodeURIComponent(c.upiId)}&pn=${encodeURIComponent(c.name)}&am=${Number(amount).toFixed(2)}&cu=INR&tn=${encodeURIComponent(note)}`;
}

export function waLink(phone, text) {
  const digits = String(phone || '').replace(/\D/g, '').slice(-10);
  return `https://wa.me/91${digits}?text=${encodeURIComponent(text)}`;
}

export const stamp = () => nowIso();

// Loyalty tier by lifetime points earned; higher tiers earn faster.
export const TIERS = [['Platinum', 20000, 1.5], ['Gold', 5000, 1.25], ['Silver', 0, 1]];
export function loyaltyOf(db, customerId) {
  const rows = (db.loyalty || []).filter((l) => l.customerId === customerId);
  const earned = rows.filter((l) => l.points > 0).reduce((s, l) => s + l.points, 0);
  const balance = rows.reduce((s, l) => s + l.points, 0);
  const [tier, , mult] = TIERS.find(([, min]) => earned >= min);
  return { earned, balance, tier, mult, rows };
}
