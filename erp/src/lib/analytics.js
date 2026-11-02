// Analytics engine: periods, KPI metrics, grouped datasets and the default dashboards.
// Every number is computed live from the app's data, so dashboards always match the modules.
import { daysBetween, round2 } from './format.js';
import { invoiceDue } from './calc.js';
import { localDate, shiftDate } from './crmMeta.js';

// ---------- periods ----------
export const PERIODS = [['this_month', 'This month'], ['last_month', 'Last month'], ['last_30', 'Last 30 days'], ['this_quarter', 'This quarter'], ['this_year', 'This year'], ['all', 'All time']];
const pad = (n) => String(n).padStart(2, '0');
const ymd = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
const lastDay = (y, m) => new Date(y, m + 1, 0).getDate();

export function rangeOf(period, now = new Date()) {
  const y = now.getFullYear(), m = now.getMonth();
  const today = localDate(now);
  switch (period) {
    // Month-to-date is compared with the same number of days last month, so early in the month it is a fair comparison.
    case 'this_month': { const pm = m ? [y, m - 1] : [y - 1, 11]; return { from: ymd(y, m, 1), to: ymd(y, m, lastDay(y, m)), prev: { from: ymd(pm[0], pm[1], 1), to: ymd(pm[0], pm[1], Math.min(now.getDate(), lastDay(...pm))) }, label: 'same days last month' }; }
    case 'last_month': { const pm = m ? [y, m - 1] : [y - 1, 11]; const pp = pm[1] ? [pm[0], pm[1] - 1] : [pm[0] - 1, 11]; return { from: ymd(pm[0], pm[1], 1), to: ymd(pm[0], pm[1], lastDay(...pm)), prev: { from: ymd(pp[0], pp[1], 1), to: ymd(pp[0], pp[1], lastDay(...pp)) }, label: 'the month before' }; }
    case 'last_30': return { from: shiftDate(-29), to: today, prev: { from: shiftDate(-59), to: shiftDate(-30) }, label: 'the previous 30 days' };
    case 'this_quarter': {
      const q = Math.floor(m / 3) * 3; const pq = q ? [y, q - 3] : [y - 1, 9];
      const elapsed = Math.floor((new Date(y, m, now.getDate()) - new Date(y, q, 1)) / 86400000);
      const pTo = new Date(pq[0], pq[1], 1 + elapsed);
      return { from: ymd(y, q, 1), to: ymd(y, q + 2, lastDay(y, q + 2)), prev: { from: ymd(pq[0], pq[1], 1), to: localDate(pTo) }, label: 'same days last quarter' };
    }
    case 'this_year': return { from: ymd(y, 0, 1), to: ymd(y, 11, 31), prev: { from: ymd(y - 1, 0, 1), to: ymd(y - 1, m, Math.min(now.getDate(), lastDay(y - 1, m))) }, label: 'same period last year' };
    default: return { from: '0000-01-01', to: '9999-12-31', prev: null, label: '' };
  }
}
const within = (iso, r) => !!iso && iso.slice(0, 10) >= r.from && iso.slice(0, 10) <= r.to;
const sum = (xs) => xs.reduce((s, x) => s + (Number(x) || 0), 0);
const live = (db) => db.invoices.filter((i) => !i.cancelled);
const kgOf = (db, l) => (db.products.find((p) => p.id === l.productId)?.baseUnit === 'kg' ? l.qty * l.factor : 0);
const openDeals = (db) => db.crm.deals.filter((d) => !d.stage.startsWith('Closed'));

// ---------- scalar metrics ----------
// snapshot: a point-in-time figure (no previous-period comparison).
export const METRICS = {
  crm_leads: { label: 'Leads created', fmt: 'int', group: 'CRM', fn: (db, r) => db.crm.leads.filter((l) => within(l.createdAt, r)).length },
  crm_contacts: { label: 'Contacts created', fmt: 'int', group: 'CRM', fn: (db, r) => db.crm.contacts.filter((l) => within(l.createdAt, r)).length },
  crm_accounts: { label: 'Accounts created', fmt: 'int', group: 'CRM', fn: (db, r) => db.crm.accounts.filter((l) => within(l.createdAt, r)).length },
  crm_won_count: { label: 'Deals won', fmt: 'int', group: 'CRM', fn: (db, r) => db.crm.deals.filter((d) => d.stage === 'Closed Won' && within(d.closingDate, r)).length },
  crm_won_value: { label: 'Won deal value', fmt: 'money', group: 'CRM', fn: (db, r) => sum(db.crm.deals.filter((d) => d.stage === 'Closed Won' && within(d.closingDate, r)).map((d) => d.amount)) },
  crm_pipeline_count: { label: 'Deals in pipeline', fmt: 'int', group: 'CRM', snapshot: true, fn: (db) => openDeals(db).length },
  crm_pipeline_value: { label: 'Pipeline value', fmt: 'money', group: 'CRM', snapshot: true, fn: (db) => sum(openDeals(db).map((d) => d.amount)) },
  crm_weighted: { label: 'Weighted forecast', fmt: 'money', group: 'CRM', snapshot: true, fn: (db) => sum(openDeals(db).map((d) => d.amount * (d.probability || 0) / 100)) },
  crm_conversion: { label: 'Lead conversion rate', fmt: 'pct', group: 'CRM', snapshot: true, fn: (db) => (db.crm.leads.length ? db.crm.leads.filter((l) => l.converted).length / db.crm.leads.length * 100 : 0) },
  crm_tasks_open: { label: 'Open tasks', fmt: 'int', group: 'CRM', snapshot: true, fn: (db) => db.crm.tasks.filter((t) => t.status !== 'Completed').length },
  crm_tasks_overdue: { label: 'Overdue tasks', fmt: 'int', group: 'CRM', snapshot: true, fn: (db) => db.crm.tasks.filter((t) => t.status !== 'Completed' && t.dueDate < localDate()).length },
  sales_revenue: { label: 'Revenue (excl. GST)', fmt: 'money', group: 'Sales', fn: (db, r) => sum(live(db).filter((i) => within(i.date, r)).map((i) => i.taxable)) },
  sales_billed: { label: 'Billed incl. GST', fmt: 'money', group: 'Sales', fn: (db, r) => sum(live(db).filter((i) => within(i.date, r)).map((i) => i.total)) },
  sales_bills: { label: 'Bills raised', fmt: 'int', group: 'Sales', fn: (db, r) => live(db).filter((i) => within(i.date, r)).length },
  sales_avg: { label: 'Average bill value', fmt: 'money', group: 'Sales', fn: (db, r) => { const x = live(db).filter((i) => within(i.date, r)); return x.length ? sum(x.map((i) => i.total)) / x.length : 0; } },
  sales_tonnage: { label: 'Steel sold (MT)', fmt: 'mt', group: 'Sales', fn: (db, r) => sum(live(db).filter((i) => within(i.date, r)).flatMap((i) => i.items.map((l) => kgOf(db, l)))) / 1000 },
  sales_margin: { label: 'Gross margin', fmt: 'pct', group: 'Sales', fn: (db, r) => {
    const x = live(db).filter((i) => within(i.date, r)); const rev = sum(x.map((i) => i.taxable));
    const cogs = sum(x.flatMap((i) => i.items.map((l) => l.qty * l.factor * (db.products.find((p) => p.id === l.productId)?.cost || 0))));
    return rev ? (rev - cogs) / rev * 100 : 0;
  } },
  col_collected: { label: 'Collected from credit customers', fmt: 'money', group: 'Credit', fn: (db, r) => sum(db.receipts.filter((x) => within(x.date, r)).map((x) => x.amount)) },
  ar_outstanding: { label: 'Receivables outstanding', fmt: 'money', group: 'Credit', snapshot: true, fn: (db) => sum(live(db).map(invoiceDue)) },
  ar_overdue: { label: 'Overdue receivables', fmt: 'money', group: 'Credit', snapshot: true, fn: (db) => sum(live(db).filter((i) => invoiceDue(i) > 0.5 && new Date(i.dueDate) < new Date()).map(invoiceDue)) },
  ar_overdue_count: { label: 'Overdue invoices', fmt: 'int', group: 'Credit', snapshot: true, fn: (db) => live(db).filter((i) => invoiceDue(i) > 0.5 && new Date(i.dueDate) < new Date()).length },
  inv_value: { label: 'Stock value at cost', fmt: 'money', group: 'Inventory', snapshot: true, fn: (db) => sum(db.products.map((p) => p.stock * p.cost)) },
  inv_low: { label: 'Items below reorder level', fmt: 'int', group: 'Inventory', snapshot: true, fn: (db) => db.products.filter((p) => Number(p.stock) <= Number(p.reorder || 0)).length },
  pur_value: { label: 'Purchase orders raised', fmt: 'money', group: 'Purchase', fn: (db, r) => sum(db.purchaseOrders.filter((p) => within(p.date, r) && p.status !== 'cancelled').flatMap((p) => p.items.map((l) => l.qty * l.rate))) },
  pur_pending: { label: 'POs awaiting approval', fmt: 'int', group: 'Purchase', snapshot: true, fn: (db) => db.purchaseOrders.filter((p) => p.status === 'pending_approval').length },
};

export function formatValue(v, fmt) {
  const n = Number(v) || 0;
  if (fmt === 'money') {
    if (Math.abs(n) >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
    if (Math.abs(n) >= 1e5) return `₹${(n / 1e5).toFixed(2)} L`;
    return '₹' + Math.round(n).toLocaleString('en-IN');
  }
  if (fmt === 'pct') return `${n.toFixed(1)}%`;
  if (fmt === 'mt') return `${n.toLocaleString('en-IN', { maximumFractionDigits: 1 })} MT`;
  return Math.round(n).toLocaleString('en-IN');
}
export function formatFull(v, fmt) {
  const n = Number(v) || 0;
  if (fmt === 'money') return '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 0 });
  return formatValue(v, fmt);
}

export function computeMetric(db, metricId, period) {
  const m = METRICS[metricId];
  const r = rangeOf(period);
  const value = m.fn(db, r);
  let prev = null, change = null;
  if (!m.snapshot && r.prev) { prev = m.fn(db, r.prev); change = prev ? (value - prev) / Math.abs(prev) * 100 : value ? null : 0; }
  return { value, prev, change, fmt: m.fmt, label: m.label, snapshot: !!m.snapshot, compare: r.label };
}

// ---------- grouped datasets ----------
const tally = (items, key, val = () => 1) => {
  const m = new Map();
  for (const it of items) { const k = key(it) || '—'; m.set(k, (m.get(k) || 0) + val(it)); }
  return [...m].map(([label, value]) => ({ label, value: round2(value) }));
};
const desc = (rows) => rows.sort((a, b) => b.value - a.value);

// Time buckets: days for short ranges, months otherwise.
function series(items, dateOf, valOf, r) {
  const from = r.from === '0000-01-01' ? (items.map(dateOf).filter(Boolean).sort()[0] || localDate()).slice(0, 10) : r.from;
  const to = r.to > localDate() ? localDate() : r.to;
  const byDay = daysBetween(from + 'T00:00:00', to + 'T00:00:00') <= 45;
  const keys = [];
  if (byDay) for (let d = from; d <= to; d = shiftDate(1, new Date(d + 'T00:00:00'))) keys.push(d);
  else { let [y, m] = from.split('-').map(Number); const [ey, em] = to.split('-').map(Number); while (y < ey || (y === ey && m <= em)) { keys.push(`${y}-${pad(m)}`); m++; if (m > 12) { m = 1; y++; } } }
  const acc = Object.fromEntries(keys.map((k) => [k, 0]));
  for (const it of items) { const d = dateOf(it)?.slice(0, 10); if (!d || d < from || d > to) continue; const k = byDay ? d : d.slice(0, 7); if (k in acc) acc[k] += Number(valOf(it)) || 0; }
  return keys.map((k) => ({ label: byDay ? new Date(k + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : new Date(k + '-01T00:00:00').toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }), value: round2(acc[k]) }));
}

export const DATASETS = {
  leads_by_source: { label: 'Leads by source', fmt: 'int', group: 'CRM', fn: (db, r) => desc(tally(db.crm.leads.filter((l) => within(l.createdAt, r)), (l) => l.source)) },
  leads_by_status: { label: 'Leads by status', fmt: 'int', group: 'CRM', fn: (db, r) => desc(tally(db.crm.leads.filter((l) => within(l.createdAt, r)), (l) => l.status)) },
  leads_by_rating: { label: 'Leads by rating', fmt: 'int', group: 'CRM', fn: (db, r) => desc(tally(db.crm.leads.filter((l) => within(l.createdAt, r)), (l) => l.rating)) },
  leads_by_industry: { label: 'Leads by industry', fmt: 'int', group: 'CRM', fn: (db, r) => desc(tally(db.crm.leads.filter((l) => within(l.createdAt, r)), (l) => l.industry)) },
  leads_trend: { label: 'Leads created over time', fmt: 'int', group: 'CRM', series: true, fn: (db, r) => series(db.crm.leads, (l) => l.createdAt, () => 1, r) },
  deals_by_stage: { label: 'Deals by stage (value)', fmt: 'money', group: 'CRM', ordered: true, fn: (db) => ['Qualification', 'Needs Analysis', 'Quotation Sent', 'Negotiation', 'Closed Won'].map((s) => ({ label: s, value: sum(db.crm.deals.filter((d) => d.stage === s).map((d) => d.amount)), count: db.crm.deals.filter((d) => d.stage === s).length })) },
  deals_by_source: { label: 'Deal value by source', fmt: 'money', group: 'CRM', fn: (db) => desc(tally(db.crm.deals, (d) => d.source, (d) => d.amount)) },
  deals_by_owner: { label: 'Deal value by salesperson', fmt: 'money', group: 'CRM', fn: (db) => desc(tally(db.crm.deals, (d) => db.users.find((u) => u.id === d.ownerId)?.name, (d) => d.amount)) },
  tasks_by_status: { label: 'Tasks by status', fmt: 'int', group: 'CRM', fn: (db) => desc(tally(db.crm.tasks, (t) => t.status)) },
  sales_trend: { label: 'Revenue over time', fmt: 'money', group: 'Sales', series: true, fn: (db, r) => series(live(db), (i) => i.date, (i) => i.taxable, r) },
  sales_by_category: { label: 'Revenue by product category', fmt: 'money', group: 'Sales', fn: (db, r) => desc(tally(live(db).filter((i) => within(i.date, r)).flatMap((i) => i.items), (l) => db.products.find((p) => p.id === l.productId)?.category, (l) => l.taxable)) },
  sales_by_product: { label: 'Top products by revenue', fmt: 'money', group: 'Sales', fn: (db, r) => desc(tally(live(db).filter((i) => within(i.date, r)).flatMap((i) => i.items), (l) => l.name, (l) => l.taxable)).slice(0, 8) },
  sales_by_customer: { label: 'Top customers by sales', fmt: 'money', group: 'Sales', fn: (db, r) => desc(tally(live(db).filter((i) => within(i.date, r)), (i) => i.customerName, (i) => i.total)).slice(0, 8) },
  sales_by_group: { label: 'Revenue by customer group', fmt: 'money', group: 'Sales', fn: (db, r) => desc(tally(live(db).filter((i) => within(i.date, r)), (i) => db.customerGroups.find((g) => g.id === db.customers.find((c) => c.id === i.customerId)?.groupId)?.name, (i) => i.taxable)) },
  sales_by_payment: { label: 'Receipts by payment mode', fmt: 'money', group: 'Sales', fn: (db, r) => desc(tally(live(db).filter((i) => within(i.date, r)).flatMap((i) => i.payments.filter((p) => !p.at)), (p) => ({ cash: 'Cash', upi: 'UPI', cheque: 'Cheque', bank: 'Bank', points: 'Loyalty points' }[p.mode] || p.mode), (p) => p.amount)) },
  col_trend: { label: 'Collections over time', fmt: 'money', group: 'Credit', series: true, fn: (db, r) => series(db.receipts, (x) => x.date, (x) => x.amount, r) },
  ar_aging: { label: 'Receivables ageing', fmt: 'money', group: 'Credit', ordered: true, fn: (db) => {
    const [a, b, c] = db.settings.agingBuckets;
    const rows = [['Not yet due', 0], [`1–${a} days`, 0], [`${a + 1}–${b} days`, 0], [`${b + 1}–${c} days`, 0], [`${c}+ days`, 0]];
    for (const i of live(db)) { const due = invoiceDue(i); if (due <= 0.5) continue; const late = daysBetween(i.dueDate); rows[late <= 0 ? 0 : late <= a ? 1 : late <= b ? 2 : late <= c ? 3 : 4][1] += due; }
    return rows.map(([label, value]) => ({ label, value: round2(value) }));
  } },
  ar_by_customer: { label: 'Overdue by customer', fmt: 'money', group: 'Credit', fn: (db) => desc(tally(live(db).filter((i) => invoiceDue(i) > 0.5 && new Date(i.dueDate) < new Date()), (i) => i.customerName, invoiceDue)).slice(0, 8) },
  stock_by_category: { label: 'Stock value by category', fmt: 'money', group: 'Inventory', fn: (db) => desc(tally(db.products, (p) => p.category, (p) => p.stock * p.cost)) },
  stock_top: { label: 'Top items by stock value', fmt: 'money', group: 'Inventory', fn: (db) => desc(tally(db.products, (p) => p.name, (p) => p.stock * p.cost)).slice(0, 8) },
  pur_by_supplier: { label: 'Purchases by supplier', fmt: 'money', group: 'Purchase', fn: (db, r) => desc(tally(db.purchaseOrders.filter((p) => within(p.date, r) && p.status !== 'cancelled'), (p) => db.suppliers.find((s) => s.id === p.supplierId)?.name, (p) => sum(p.items.map((l) => l.qty * l.rate)))) },
};

export const computeDataset = (db, id, period) => {
  const d = DATASETS[id];
  return { rows: d.fn(db, rangeOf(period)), fmt: d.fmt, label: d.label, series: !!d.series, ordered: !!d.ordered };
};

export const CHART_TYPES = [
  ['kpi', 'KPI tile', 'metric'], ['gauge', 'Gauge (vs target)', 'metric'], ['bullet', 'Target bar', 'metric'],
  ['bar', 'Bar chart', 'dataset'], ['column', 'Column chart', 'dataset'], ['line', 'Line chart', 'dataset'],
  ['donut', 'Donut chart', 'dataset'], ['funnel', 'Funnel', 'dataset'], ['table', 'Table', 'dataset'],
];
export const SIZES = [[3, 'Small (¼)'], [4, 'Medium (⅓)'], [6, 'Half'], [8, 'Wide (⅔)'], [12, 'Full width']];
export const isMetricType = (t) => CHART_TYPES.find(([k]) => k === t)?.[2] === 'metric';

// ---------- default dashboards ----------
let n = 0;
const c = (type, title, source, w, extra = {}) => ({ id: `c${++n}`, type, title, source, w, period: 'this_year', ...extra });
export const DEFAULT_DASHBOARDS = [
  { id: 'org', name: 'Org Overview', comps: [
    c('kpi', 'LEADS THIS MONTH', 'crm_leads', 3, { period: 'this_month' }),
    c('kpi', 'REVENUE THIS MONTH', 'sales_revenue', 3, { period: 'this_month' }),
    c('kpi', 'DEALS IN PIPELINE', 'crm_pipeline_count', 3),
    c('kpi', 'ACCOUNTS THIS MONTH', 'crm_accounts', 3, { period: 'this_month' }),
    c('gauge', 'LEAD GENERATION TARGET - THIS YEAR', 'crm_leads', 5, { target: 120 }),
    c('bullet', 'REVENUE TARGET - THIS YEAR', 'sales_revenue', 7, { target: 20000000 }),
    c('column', 'REVENUE TREND', 'sales_trend', 8),
    c('donut', 'LEADS BY SOURCE', 'leads_by_source', 4),
    c('funnel', 'SALES FUNNEL (DEAL VALUE)', 'deals_by_stage', 6, { period: 'all' }),
    c('table', 'TOP CUSTOMERS', 'sales_by_customer', 6),
  ] },
  { id: 'sales', name: 'Sales Performance', comps: [
    c('kpi', 'REVENUE', 'sales_revenue', 3, { period: 'this_month' }),
    c('kpi', 'BILLS RAISED', 'sales_bills', 3, { period: 'this_month' }),
    c('kpi', 'STEEL SOLD', 'sales_tonnage', 3, { period: 'this_month' }),
    c('kpi', 'GROSS MARGIN', 'sales_margin', 3, { period: 'this_month' }),
    c('line', 'REVENUE - LAST 30 DAYS', 'sales_trend', 8, { period: 'last_30' }),
    c('donut', 'RECEIPTS BY PAYMENT MODE', 'sales_by_payment', 4),
    c('bar', 'REVENUE BY PRODUCT CATEGORY', 'sales_by_category', 6),
    c('bar', 'TOP PRODUCTS', 'sales_by_product', 6),
  ] },
  { id: 'credit', name: 'Credit & Collections', comps: [
    c('kpi', 'RECEIVABLES', 'ar_outstanding', 3),
    c('kpi', 'OVERDUE', 'ar_overdue', 3),
    c('kpi', 'OVERDUE INVOICES', 'ar_overdue_count', 3),
    c('kpi', 'COLLECTED THIS MONTH', 'col_collected', 3, { period: 'this_month' }),
    c('column', 'RECEIVABLES AGEING', 'ar_aging', 6),
    c('table', 'OVERDUE BY CUSTOMER', 'ar_by_customer', 6),
    c('line', 'COLLECTIONS - THIS YEAR', 'col_trend', 12),
  ] },
  { id: 'inventory', name: 'Inventory & Purchase', comps: [
    c('kpi', 'STOCK VALUE', 'inv_value', 3),
    c('kpi', 'ITEMS BELOW REORDER', 'inv_low', 3),
    c('kpi', 'PURCHASES THIS MONTH', 'pur_value', 3, { period: 'this_month' }),
    c('kpi', 'POs AWAITING APPROVAL', 'pur_pending', 3),
    c('bar', 'STOCK VALUE BY CATEGORY', 'stock_by_category', 6),
    c('bar', 'TOP ITEMS BY STOCK VALUE', 'stock_top', 6),
    c('bar', 'PURCHASES BY SUPPLIER', 'pur_by_supplier', 12),
  ] },
  { id: 'pipeline', name: 'CRM Pipeline', comps: [
    c('kpi', 'PIPELINE VALUE', 'crm_pipeline_value', 3),
    c('kpi', 'WEIGHTED FORECAST', 'crm_weighted', 3),
    c('kpi', 'WON THIS YEAR', 'crm_won_value', 3),
    c('kpi', 'LEAD CONVERSION', 'crm_conversion', 3),
    c('funnel', 'DEALS BY STAGE', 'deals_by_stage', 6, { period: 'all' }),
    c('bar', 'LEADS BY STATUS', 'leads_by_status', 6),
    c('donut', 'DEAL VALUE BY SOURCE', 'deals_by_source', 6),
    c('bar', 'TASKS BY STATUS', 'tasks_by_status', 6),
  ] },
];
