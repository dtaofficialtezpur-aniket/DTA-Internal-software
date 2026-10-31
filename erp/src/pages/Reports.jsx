import { useState } from 'react';
import { useStore } from '../lib/store.jsx';
import { agingBuckets, customerLedger, invoiceDue } from '../lib/calc.js';
import { money, qty, date, downloadCsv, round2 } from '../lib/format.js';
import { Bars, Field, HBar, Icon, PageHead, Stat, Tabs } from '../components/ui.jsx';

const iso = (d) => d.toISOString().slice(0, 10);

export default function Reports() {
  const { db } = useStore();
  const [tab, setTab] = useState('sales');
  const first = new Date(); first.setDate(1);
  const [from, setFrom] = useState(iso(first));
  const [to, setTo] = useState(iso(new Date()));
  const inRange = (d) => d.slice(0, 10) >= from && d.slice(0, 10) <= to;
  const invs = db.invoices.filter((i) => !i.cancelled && inRange(i.date));

  return (
    <div className="page">
      <PageHead title="Reports & Analytics" sub="All figures follow the selected period">
        <Field label="From"><input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="To"><input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
      </PageHead>
      <div style={{ marginBottom: 16 }}><Tabs value={tab} onChange={setTab} items={[['sales', 'Sales'], ['kpi', 'KPIs'], ['stock', 'Inventory movement'], ['credit', 'Credit & collection'], ['gst', 'GST & Tally']]} /></div>
      {tab === 'sales' && <SalesReport invs={invs} />}
      {tab === 'kpi' && <Kpi invs={invs} inRange={inRange} />}
      {tab === 'stock' && <StockReport inRange={inRange} from={from} />}
      {tab === 'credit' && <CreditReport inRange={inRange} />}
      {tab === 'gst' && <GstReport invs={invs} from={from} to={to} />}
    </div>
  );
}

function SalesReport({ invs }) {
  const { db } = useStore();
  const byDay = {};
  for (const i of invs) byDay[i.date.slice(0, 10)] = (byDay[i.date.slice(0, 10)] || 0) + i.total;
  const days = Object.entries(byDay).sort().slice(-31).map(([d, v]) => ({ label: d.slice(8), value: v }));
  const byProduct = {}, byCustomer = {}, byMode = {};
  for (const i of invs) {
    for (const l of i.items) { const r = (byProduct[l.productId] ||= { qty: 0, value: 0 }); r.qty += l.qty * l.factor; r.value += l.taxable; }
    byCustomer[i.customerName] = (byCustomer[i.customerName] || 0) + i.total;
    for (const p of i.payments) if (!p.at) byMode[p.mode] = (byMode[p.mode] || 0) + p.amount;
    if (invoiceDue(i) > 0) byMode.credit = (byMode.credit || 0) + invoiceDue(i);
  }
  const prodRows = Object.entries(byProduct).sort((a, b) => b[1].value - a[1].value);
  const custRows = Object.entries(byCustomer).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const total = invs.reduce((s, i) => s + i.total, 0);
  return (
    <div className="grid stagger">
      <div className="grid g4">
        <Stat label="Sales incl. GST" value={total} icon="chart" />
        <Stat label="Taxable value" value={invs.reduce((s, i) => s + i.taxable, 0)} icon="invoice" tone="gold" />
        <Stat label="Bills" value={invs.length} money={false} icon="pos" tone="green" />
        <Stat label="Average bill" value={invs.length ? total / invs.length : 0} icon="wallet" />
      </div>
      <div className="card"><div className="card-head"><h3>Daily sales</h3></div><div className="card-body"><Bars data={days} /></div></div>
      <div className="grid g2">
        <div className="card">
          <div className="card-head"><h3>By product</h3><button className="btn sm" onClick={() => downloadCsv('sales-by-product.csv', [['Item', 'Qty (base)', 'Taxable'], ...prodRows.map(([id, r]) => [db.products.find((p) => p.id === id)?.name, round2(r.qty), round2(r.value)])])}><Icon name="download" />CSV</button></div>
          <table className="t"><thead><tr><th>Item</th><th className="num">Qty</th><th className="num">Taxable</th></tr></thead>
            <tbody>{prodRows.map(([id, r]) => { const p = db.products.find((x) => x.id === id); return <tr key={id}><td>{p?.name}</td><td className="num">{qty(r.qty)} {p?.baseUnit}</td><td className="num">{money(r.value)}</td></tr>; })}</tbody></table>
        </div>
        <div className="grid">
          <div className="card">
            <div className="card-head"><h3>Top customers</h3></div>
            {custRows.map(([n, v]) => <div className="list-row" key={n}><div className="grow"><div className="small strong">{n}</div><HBar pct={v / (custRows[0][1] || 1) * 100} tone="gold" /></div><div className="small">{money(v)}</div></div>)}
          </div>
          <div className="card">
            <div className="card-head"><h3>By payment mode</h3></div>
            {Object.entries(byMode).map(([m, v]) => <div className="list-row" key={m}><span className="grow small strong" style={{ textTransform: 'capitalize' }}>{m}</span><span className="small">{money(v)}</span></div>)}
          </div>
        </div>
      </div>
    </div>
  );
}

function Kpi({ invs, inRange }) {
  const { db } = useStore();
  const taxable = invs.reduce((s, i) => s + i.taxable, 0);
  const cogs = invs.reduce((s, i) => s + i.items.reduce((a, l) => a + l.qty * l.factor * (db.products.find((p) => p.id === l.productId)?.cost || 0), 0), 0);
  const margin = taxable ? (taxable - cogs) / taxable * 100 : 0;
  const receipts = db.receipts.filter((r) => inRange(r.date)).reduce((s, r) => s + r.amount, 0);
  const creditSales = invs.reduce((s, i) => s + i.total - i.payments.filter((p) => !p.at).reduce((a, p) => a + p.amount, 0), 0);
  const outstanding = db.invoices.filter((i) => !i.cancelled).reduce((s, i) => s + invoiceDue(i), 0);
  const days = Math.max(1, invs.length ? (new Date(invs.at(-1).date) - new Date(invs[0].date)) / 86400000 + 1 : 1);
  const dso = outstanding / Math.max(1, invs.reduce((s, i) => s + i.total, 0) / days);
  const stockValue = db.products.reduce((s, p) => s + p.stock * p.cost, 0);
  const sessions = db.sessions.filter((s) => s.closedAt && inRange(s.closedAt));
  const cashDiff = sessions.reduce((s, x) => s + (x.diff || 0), 0);
  const discounts = invs.reduce((s, i) => s + i.manualDisc, 0);
  const approvals = invs.filter((i) => i.approval).length;
  const overrides = invs.filter((i) => i.override).length;
  const tiles = [
    ['Gross margin', `${margin.toFixed(1)}%`, `${money(taxable - cogs)} on ${money(taxable)}`],
    ['Days sales outstanding', `${dso.toFixed(0)} days`, 'Receivables ÷ average daily sales'],
    ['Collection efficiency', creditSales ? `${Math.min(100, receipts / creditSales * 100).toFixed(0)}%` : '—', `${money(receipts)} collected vs ${money(creditSales)} credit given`],
    ['Stock cover', `${(stockValue / Math.max(1, cogs / days)).toFixed(0)} days`, `${money(stockValue)} at cost`],
    ['Manual discounts given', money(discounts), `${approvals} approved above limit`],
    ['Credit overrides', String(overrides), 'Bills allowed past the credit block'],
    ['Cash differences', money(cashDiff), `${sessions.length} sessions closed`],
    ['Tonnage sold', `${qty(invs.reduce((s, i) => s + i.items.reduce((a, l) => a + (db.products.find((p) => p.id === l.productId)?.baseUnit === 'kg' ? l.qty * l.factor : 0), 0), 0) / 1000)} MT`, 'Steel items by weight'],
  ];
  return (
    <div className="grid g4 stagger">
      {tiles.map(([l, v, s]) => <div className="card stat hover" key={l}><div className="label">{l}</div><div className="value">{v}</div><div className="sub">{s}</div></div>)}
    </div>
  );
}

function StockReport({ inRange, from }) {
  const { db } = useStore();
  const rows = db.products.map((p) => {
    const led = db.stockLedger.filter((l) => l.productId === p.id);
    const opening = led.filter((l) => l.date.slice(0, 10) < from).reduce((s, l) => s + l.qty, 0);
    const within = led.filter((l) => inRange(l.date));
    const sum = (t) => within.filter((l) => t.includes(l.type)).reduce((s, l) => s + l.qty, 0);
    const inward = sum(['purchase', 'opening']), outward = -sum(['sale']), adj = sum(['adjust', 'count', 'cancel']);
    return { p, opening, inward, outward, adj, closing: opening + inward - outward + adj };
  });
  return (
    <div className="card">
      <div className="card-head"><h3>Inventory movement</h3><button className="btn sm" onClick={() => downloadCsv('inventory-movement.csv', [['Item', 'Unit', 'Opening', 'In', 'Out', 'Adjustments', 'Closing'], ...rows.map((r) => [r.p.name, r.p.baseUnit, round2(r.opening), round2(r.inward), round2(r.outward), round2(r.adj), round2(r.closing)])])}><Icon name="download" />CSV</button></div>
      <div className="table-wrap"><table className="t">
        <thead><tr><th>Item</th><th className="num">Opening</th><th className="num">Inward</th><th className="num">Outward</th><th className="num">Adjustments</th><th className="num">Closing</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.p.id}><td>{r.p.name}</td><td className="num">{qty(r.opening)}</td><td className="num" style={{ color: 'var(--ok)' }}>{qty(r.inward)}</td><td className="num" style={{ color: 'var(--bad)' }}>{qty(r.outward)}</td><td className="num">{qty(r.adj)}</td><td className="num strong">{qty(r.closing)} {r.p.baseUnit}</td></tr>)}</tbody>
      </table></div>
    </div>
  );
}

function CreditReport({ inRange }) {
  const { db } = useStore();
  const [a, b, c] = db.settings.agingBuckets;
  const rows = db.customers.filter((x) => x.id !== 'walkin').map((cu) => ({ cu, l: customerLedger(db, cu.id), ag: agingBuckets(db, customerLedger(db, cu.id).invs) })).filter((r) => r.l.outstanding > 0.5);
  const keys = ['current', `1-${a}`, `${a + 1}-${b}`, `${b + 1}-${c}`, `${c}+`];
  const receipts = db.receipts.filter((r) => inRange(r.date));
  const reminders = db.reminders.filter((r) => inRange(r.at));
  return (
    <div className="grid stagger">
      <div className="card">
        <div className="card-head"><h3>Ageing by customer</h3><button className="btn sm" onClick={() => downloadCsv('ageing.csv', [['Customer', ...keys, 'Total'], ...rows.map((r) => [r.cu.name, ...keys.map((k) => round2(r.ag[k])), r.l.outstanding])])}><Icon name="download" />CSV</button></div>
        <div className="table-wrap"><table className="t">
          <thead><tr><th>Customer</th>{keys.map((k) => <th key={k} className="num">{k === 'current' ? 'Not due' : k}</th>)}<th className="num">Total</th></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.cu.id}><td>{r.cu.name}</td>{keys.map((k) => <td key={k} className="num">{r.ag[k] ? money(r.ag[k]) : '—'}</td>)}<td className="num strong">{money(r.l.outstanding)}</td></tr>)}</tbody>
        </table></div>
      </div>
      <div className="grid g2">
        <div className="card"><div className="card-head"><h3>Receipts in period</h3><span className="badge ok">{money(receipts.reduce((s, r) => s + r.amount, 0))}</span></div>
          <table className="t"><tbody>{receipts.slice(-12).reverse().map((r) => <tr key={r.id}><td>{r.no}</td><td>{date(r.date)}</td><td>{db.customers.find((x) => x.id === r.customerId)?.name}</td><td className="num">{money(r.amount)}</td></tr>)}</tbody></table></div>
        <div className="card"><div className="card-head"><h3>Follow-ups in period</h3><span className="badge blue">{reminders.length}</span></div>
          <table className="t"><tbody>{reminders.slice(-12).reverse().map((r) => <tr key={r.id}><td>{date(r.at)}</td><td>{db.customers.find((x) => x.id === r.customerId)?.name}</td><td className="num">{money(r.amount)}</td></tr>)}</tbody></table></div>
      </div>
    </div>
  );
}

function GstReport({ invs, from, to }) {
  const { db } = useStore();
  const byRate = {};
  for (const i of invs) for (const l of i.items) {
    const r = (byRate[`${l.hsn}|${l.gst}`] ||= { hsn: l.hsn, gst: l.gst, taxable: 0, cgst: 0, sgst: 0, igst: 0 });
    r.taxable += l.taxable; r.cgst += l.cgst; r.sgst += l.sgst; r.igst += l.igst;
  }
  const rows = Object.values(byRate);
  const b2b = invs.filter((i) => db.customers.find((c) => c.id === i.customerId)?.gstin);
  return (
    <div className="grid stagger">
      <div className="card">
        <div className="card-head"><div><h3>HSN summary</h3><p>{date(from)} – {date(to)}</p></div>
          <div className="actions">
            <button className="btn sm" onClick={() => downloadCsv('gstr1-b2b.csv', [['GSTIN', 'Customer', 'Invoice', 'Date', 'Taxable', 'CGST', 'SGST', 'IGST', 'Total'], ...b2b.map((i) => [db.customers.find((c) => c.id === i.customerId).gstin, i.customerName, i.no, date(i.date), i.taxable, round2(i.items.reduce((s, l) => s + l.cgst, 0)), round2(i.items.reduce((s, l) => s + l.sgst, 0)), round2(i.items.reduce((s, l) => s + l.igst, 0)), i.total])])}><Icon name="download" />GSTR-1 B2B (CSV)</button>
            <button className="btn sm primary" onClick={() => tallyExport(db, invs)}><Icon name="download" />Tally XML (sales vouchers)</button>
          </div>
        </div>
        <table className="t"><thead><tr><th>HSN</th><th className="num">Rate</th><th className="num">Taxable</th><th className="num">CGST</th><th className="num">SGST</th><th className="num">IGST</th></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.hsn + r.gst}><td>{r.hsn}</td><td className="num">{r.gst}%</td><td className="num">{money(r.taxable)}</td><td className="num">{money(r.cgst)}</td><td className="num">{money(r.sgst)}</td><td className="num">{money(r.igst)}</td></tr>)}</tbody>
          <tfoot><tr><td colSpan={2}>Total</td>{['taxable', 'cgst', 'sgst', 'igst'].map((k) => <td key={k} className="num">{money(rows.reduce((s, r) => s + r[k], 0))}</td>)}</tr></tfoot>
        </table>
      </div>
      <div className="alert info"><Icon name="info" /><div>The Tally file imports sales vouchers through Gateway of Tally → Import Data → Vouchers. Ledger names (Sales GST 18%, Output CGST, Output SGST, Output IGST, Round Off and party names) must exist in Tally or be mapped once during setup.</div></div>
    </div>
  );
}

const x = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function tallyExport(db, invs) {
  const v = invs.map((i) => {
    const d = i.date.slice(0, 10).replace(/-/g, '');
    const cg = round2(i.items.reduce((s, l) => s + l.cgst, 0)), sg = round2(i.items.reduce((s, l) => s + l.sgst, 0)), ig = round2(i.items.reduce((s, l) => s + l.igst, 0));
    const party = i.customerId === 'walkin' ? 'Cash' : i.customerName;
    const led = (name, amt, debit) => `<ALLLEDGERENTRIES.LIST><LEDGERNAME>${x(name)}</LEDGERNAME><ISDEEMEDPOSITIVE>${debit ? 'Yes' : 'No'}</ISDEEMEDPOSITIVE><AMOUNT>${debit ? -amt : amt}</AMOUNT></ALLLEDGERENTRIES.LIST>`;
    return `<TALLYMESSAGE xmlns:UDF="TallyUDF"><VOUCHER VCHTYPE="Sales" ACTION="Create"><DATE>${d}</DATE><VOUCHERTYPENAME>Sales</VOUCHERTYPENAME><VOUCHERNUMBER>${x(i.no)}</VOUCHERNUMBER><PARTYLEDGERNAME>${x(party)}</PARTYLEDGERNAME><PERSISTEDVIEW>Accounting Voucher View</PERSISTEDVIEW>
${led(party, i.total, true)}${led('Sales GST 18%', i.taxable, false)}${cg ? led('Output CGST', cg, false) : ''}${sg ? led('Output SGST', sg, false) : ''}${ig ? led('Output IGST', ig, false) : ''}${i.roundOff ? led('Round Off', i.roundOff, false) : ''}
</VOUCHER></TALLYMESSAGE>`;
  }).join('\n');
  const xml = `<ENVELOPE><HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER><BODY><IMPORTDATA><REQUESTDESC><REPORTNAME>Vouchers</REPORTNAME><STATICVARIABLES><SVCURRENTCOMPANY>${x(db.company.name)}</SVCURRENTCOMPANY></STATICVARIABLES></REQUESTDESC><REQUESTDATA>\n${v}\n</REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>`;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([xml], { type: 'application/xml' }));
  a.download = 'tally-sales-vouchers.xml';
  a.click();
}
