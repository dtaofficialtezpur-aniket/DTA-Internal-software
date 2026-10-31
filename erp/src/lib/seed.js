// Demo data so the system can be shown before real data is imported.
// Customers, suppliers and transactions are fictional.
import { computeBill, basePrice, groupDiscount } from './calc.js';
import { addDays, round2 } from './format.js';
import { addExtras } from './seedExtras.js';

export const DEMO_PINS = {
  abhimanyu: '1111', salesmgr: '2222', cashier: '3333', godown: '4444', accounts: '5555', salesman: '6666', security: '7777',
};

const steel = (id, sku, name, hsn, kgPerM, barLen, price, abc, reorder, extra = {}) => ({
  id, sku, name, category: extra.category || 'TMT Rebars', hsn, gst: 18, baseUnit: 'kg',
  units: [{ unit: 'pcs', factor: round2(kgPerM * barLen) }, { unit: 'mtr', factor: kgPerM }],
  cost: round2(price * 0.93), stock: 0, reorder, abc, active: true, _price: price,
});

export function buildSeed() {
  const products = [
    steel('p1', 'TMT-08', 'TMT Bar Fe-550D 8 mm', '7214', 0.395, 12, 64.5, 'A', 3000),
    steel('p2', 'TMT-10', 'TMT Bar Fe-550D 10 mm', '7214', 0.617, 12, 63.5, 'A', 4000),
    steel('p3', 'TMT-12', 'TMT Bar Fe-550D 12 mm', '7214', 0.888, 12, 63.0, 'A', 5000),
    steel('p4', 'TMT-16', 'TMT Bar Fe-550D 16 mm', '7214', 1.58, 12, 62.5, 'B', 4000),
    steel('p5', 'TMT-20', 'TMT Bar Fe-550D 20 mm', '7214', 2.47, 12, 62.5, 'B', 3000),
    steel('p6', 'TMT-25', 'TMT Bar Fe-550D 25 mm', '7214', 3.85, 12, 62.5, 'C', 2000),
    steel('p7', 'ANG-4040', 'MS Angle 40 × 40 × 5 mm', '7216', 3.0, 6, 68, 'B', 1500, { category: 'Steel Structurals' }),
    steel('p8', 'ANG-5050', 'MS Angle 50 × 50 × 5 mm', '7216', 3.8, 6, 68, 'B', 1500, { category: 'Steel Structurals' }),
    steel('p9', 'CHN-100', 'MS Channel ISMC 100', '7216', 9.56, 6, 70, 'C', 1000, { category: 'Steel Structurals' }),
    steel('p10', 'FLT-5006', 'MS Flat 50 × 6 mm', '7216', 2.36, 6, 69, 'C', 800, { category: 'Steel Structurals' }),
    steel('p11', 'SQP-4040', 'MS Square Pipe 40 × 40 × 2 mm', '7306', 2.38, 6, 74, 'C', 600, { category: 'Steel Structurals' }),
    { id: 'p12', sku: 'BW-18', name: 'Binding Wire 18 G', category: 'Allied Products', hsn: '7217', gst: 18, baseUnit: 'kg',
      units: [{ unit: 'box', factor: 25 }], cost: 76, stock: 0, reorder: 300, abc: 'B', active: true, _price: 82 },
    { id: 'p13', sku: 'CB-25', name: 'Concrete Cover Block 25 mm', category: 'Allied Products', hsn: '6810', gst: 18, baseUnit: 'pcs',
      units: [{ unit: 'carton', factor: 100 }], cost: 3.2, stock: 0, reorder: 2000, abc: 'C', active: true, _price: 4 },
    { id: 'p14', sku: 'WR-315', name: 'Welding Electrode 3.15 mm (Packet)', category: 'Allied Products', hsn: '8311', gst: 18, baseUnit: 'box',
      units: [], cost: 410, stock: 0, reorder: 20, abc: 'C', active: true, _price: 455 },
  ];

  const retail = { id: 'pl-retail', name: 'Retail', isDefault: true, prices: {} };
  const b2b = { id: 'pl-b2b', name: 'B2B / Contractor', prices: {} };
  const dealer = { id: 'pl-dealer', name: 'Dealer', prices: {} };
  for (const p of products) {
    retail.prices[p.id] = p._price;
    b2b.prices[p.id] = round2(p._price * 0.97);
    dealer.prices[p.id] = round2(p._price * 0.955);
    delete p._price;
  }

  const customerGroups = [
    { id: 'g-retail', name: 'Retail', pricelistId: 'pl-retail', discount: 0 },
    { id: 'g-b2b', name: 'B2B Contractor', pricelistId: 'pl-b2b', discount: 0.5 },
    { id: 'g-dealer', name: 'Dealer', pricelistId: 'pl-dealer', discount: 1 },
  ];

  const customers = [
    { id: 'walkin', name: 'Walk-in Customer', phone: '', groupId: 'g-retail', creditLimit: 0, creditDays: 0, stateCode: '18', address: '' },
    { id: 'c1', name: 'Brahmaputra Builders', phone: '9800000001', gstin: '18AAAAA0001A1Z5', groupId: 'g-b2b', creditLimit: 800000, creditDays: 30, stateCode: '18', address: 'Mission Chariali, Tezpur' },
    { id: 'c2', name: 'Sonitpur Constructions', phone: '9800000002', gstin: '18AAAAA0002A1Z5', groupId: 'g-b2b', creditLimit: 500000, creditDays: 30, stateCode: '18', address: 'Dekargaon, Tezpur' },
    { id: 'c3', name: 'Kamakhya Hardware', phone: '9800000003', gstin: '18AAAAA0003A1Z5', groupId: 'g-dealer', creditLimit: 1200000, creditDays: 45, stateCode: '18', address: 'Main Road, Biswanath Chariali' },
    { id: 'c4', name: 'Kamakhya Hardware – Gohpur Branch', phone: '9800000004', groupId: 'g-dealer', parentId: 'c3', creditLimit: 400000, creditDays: 45, stateCode: '18', address: 'Gohpur' },
    { id: 'c5', name: 'R. K. Engineering Works', phone: '9800000005', groupId: 'g-b2b', creditLimit: 200000, creditDays: 15, stateCode: '18', address: 'Parua, Tezpur' },
    { id: 'c6', name: 'Arunachal Infra Projects', phone: '9800000006', gstin: '12AAAAA0006A1Z5', groupId: 'g-b2b', creditLimit: 600000, creditDays: 30, stateCode: '12', address: 'Bhalukpong, Arunachal Pradesh' },
    { id: 'c7', name: 'Mr. Dutta (Residence)', phone: '9800000007', groupId: 'g-retail', creditLimit: 50000, creditDays: 15, stateCode: '18', address: 'Kacharigaon, Tezpur' },
  ];

  const suppliers = [
    { id: 's1', name: 'North East Ispat Distributors', phone: '9800000101', gstin: '18AAAAB0101A1Z5', address: 'Guwahati' },
    { id: 's2', name: 'Eastern Structurals Pvt. Ltd.', phone: '9800000102', gstin: '19AAAAB0102A1Z5', address: 'Kolkata' },
  ];

  const db = {
    version: 1,
    company: {
      name: 'Shanti Trading Company', tagline: 'Steel Structurals · TMT Rebars · Allied Products',
      address: 'Near Don Bosco School, Parua, Tezpur, Assam', phone: '9900521692',
      email: 'shantitradingcompany.tezpur@gmail.com', gstin: '', stateCode: '18', state: 'Assam', upiId: '',
      bank: '',
    },
    settings: {
      discountTiers: [
        { role: 'cashier', max: 1 }, { role: 'salesman', max: 2 }, { role: 'sales_manager', max: 5 }, { role: 'owner', max: 100 },
      ],
      agingBuckets: [30, 60, 90],
      reminderEvery: 7,
      cycleEvery: { A: 7, B: 30, C: 90 },
      cycleDailyLimit: 6,
      roundOff: true,
      loyalty: { enabled: true, pointsPer100: 1, pointValue: 1, minRedeem: 100 },
      hr: { shiftStart: '09:30', paidLeavePerYear: 12, workDays: [1, 2, 3, 4, 5, 6] },
    },
    users: [
      { id: 'u1', name: 'Abhimanyu Chhawchharia', username: 'abhimanyu', role: 'owner', active: true },
      { id: 'u2', name: 'Sales Manager', username: 'salesmgr', role: 'sales_manager', active: true },
      { id: 'u3', name: 'Billing Counter', username: 'cashier', role: 'cashier', active: true },
      { id: 'u4', name: 'Godown In-charge', username: 'godown', role: 'warehouse', active: true },
      { id: 'u5', name: 'Accounts', username: 'accounts', role: 'accounts', active: true },
      { id: 'u6', name: 'Field Salesman', username: 'salesman', role: 'salesman', active: true },
      { id: 'u7', name: 'Gate Security', username: 'security', role: 'security', active: true },
    ],
    products, pricelists: [retail, b2b, dealer], customerGroups, customers, suppliers,
    offers: [
      { id: 'o1', name: 'TMT bulk slab (2 MT+)', category: 'TMT Rebars', minBase: 2000, discPct: 0.75, from: '', to: '', active: true },
      { id: 'o2', name: 'Binding wire — 5 bundles+', productId: 'p12', minBase: 125, discPct: 2, from: '', to: '', active: true },
    ],
    invoices: [], receipts: [], sessions: [], picklists: [], purchaseOrders: [],
    stockLedger: [], cycleCounts: [], reminders: [], gateLog: [], audit: [],
    leads: [], loyalty: [], bankLines: [], billScans: [],
    hr: { profiles: {}, attendance: [], leaves: [], advances: [], payslips: [] },
    seq: { INV: 0, PO: 0, PL: 0, RC: 0, GRN: 0, LD: 0 },
  };

  // Opening stock, roughly 3x the reorder level.
  const open = addDays(new Date().toISOString(), -62);
  for (const p of products) {
    p.stock = p.reorder * 3;
    db.stockLedger.push({ id: 'sl-o-' + p.id, date: open, productId: p.id, qty: p.stock, type: 'opening', ref: 'Opening stock', cost: p.cost });
  }

  // Two months of sales history with a deterministic generator.
  let s = 7;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  for (let d = 60; d >= 1; d--) {
    const day = new Date(); day.setDate(day.getDate() - d); day.setHours(10, 0, 0, 0);
    if (day.getDay() === 0) continue;
    const n = 3 + Math.floor(rnd() * 5);
    for (let k = 0; k < n; k++) {
      const at = new Date(day.getTime() + k * 3600e3 * 1.3).toISOString();
      const cust = rnd() < 0.4 ? customers[0] : pick(customers.slice(1));
      const lines = [];
      const count = 1 + Math.floor(rnd() * 3);
      for (let j = 0; j < count; j++) {
        const p = pick(products);
        const unit = p.baseUnit === 'kg' && rnd() < 0.6 && p.units[0] ? p.units[0].unit : p.baseUnit;
        const factor = unit === p.baseUnit ? 1 : p.units.find((u) => u.unit === unit).factor;
        const q = p.baseUnit === 'kg' ? (unit === 'kg' ? 50 + Math.floor(rnd() * 400) : 5 + Math.floor(rnd() * 40)) : 1 + Math.floor(rnd() * 20);
        lines.push({ productId: p.id, name: p.name, hsn: p.hsn, unit, factor, qty: q, rate: round2(basePrice(db, p, cust) * factor), gst: p.gst, discPct: 0 });
      }
      const bill = computeBill({ lines, groupDiscPct: groupDiscount(db, cust), interState: cust.stateCode !== '18' });
      const credit = cust.id !== 'walkin' && rnd() < 0.7;
      const no = ++db.seq.INV;
      const inv = {
        id: 'inv' + no, no: invoiceNo(no, at), date: at, customerId: cust.id, customerName: cust.name, ...bill,
        payments: credit ? [] : [{ mode: rnd() < 0.5 ? 'cash' : 'upi', amount: bill.total }],
        paid: credit ? 0 : bill.total, dueDate: addDays(at, cust.creditDays || 0), userId: 'u3', paidAt: credit ? null : at,
      };
      // Most older credit bills get settled, some late.
      if (credit && d > 20 && rnd() < 0.8) {
        const paidAt = addDays(inv.dueDate, Math.floor(rnd() * 20) - 8);
        inv.paid = inv.total; inv.paidAt = paidAt;
        db.receipts.push({ id: 'rc' + (++db.seq.RC), no: 'RC-' + db.seq.RC, date: paidAt, customerId: cust.id, amount: inv.total, mode: 'bank', ref: 'NEFT', allocations: [{ invoiceId: inv.id, amount: inv.total }] });
      }
      db.invoices.push(inv);
      for (const l of bill.items) {
        const p = products.find((x) => x.id === l.productId);
        p.stock = round2(p.stock - l.qty * l.factor);
        db.stockLedger.push({ id: 'sl-' + inv.id + l.productId, date: at, productId: p.id, qty: -round2(l.qty * l.factor), type: 'sale', ref: inv.no });
      }
    }
  }
  for (const p of products) if (p.stock < 0) p.stock = round2(p.reorder * 0.6);

  // A few items are below reorder level so the alerts have something to show.
  products[4].stock = round2(products[4].reorder * 0.7);
  products[12].stock = 1500;

  // Last three bills await picking in the godown.
  for (const inv of db.invoices.slice(-3)) {
    const no = ++db.seq.PL;
    db.picklists.push({ id: 'pl' + no, no: 'PL-' + String(no).padStart(4, '0'), invoiceId: inv.id, date: inv.date, status: 'pending',
      lines: inv.items.map((l) => ({ productId: l.productId, name: l.name, unit: l.unit, qty: l.qty, expectedKg: products.find((p) => p.id === l.productId).baseUnit === 'kg' ? round2(l.factor * l.qty) : 0, weighedKg: '' })) });
  }

  const poNo = ++db.seq.PO;
  db.purchaseOrders.push({
    id: 'po' + poNo, no: 'PO-' + String(poNo).padStart(4, '0'), date: addDays(new Date().toISOString(), -2), supplierId: 's1', status: 'pending_approval',
    createdBy: 'u5', items: [
      { productId: 'p5', name: products[4].name, unit: 'kg', factor: 1, qty: 6000, rate: 58.2, gst: 18 },
      { productId: 'p3', name: products[2].name, unit: 'kg', factor: 1, qty: 8000, rate: 58.5, gst: 18 },
    ],
  });

  addExtras(db, rnd);
  return db;
}

export function invoiceNo(n, at = new Date().toISOString()) {
  const d = new Date(at);
  const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return `STC/${String(y).slice(2)}-${String(y + 1).slice(2)}/${String(n).padStart(4, '0')}`;
}
