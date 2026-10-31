import { useState } from 'react';
import { useStore } from '../lib/store.jsx';
import { invoiceDue, waLink } from '../lib/calc.js';
import { money, qty, date, dateTime, downloadCsv } from '../lib/format.js';
import { moveStock } from '../lib/ops.js';
import { printGstInvoice, printThermal } from '../lib/print.js';
import { ApprovalModal, DemoLeft, Empty, Icon, Modal, PageHead, Search, Tabs } from '../components/ui.jsx';

export default function Sales() {
  const { db } = useStore();
  const [q, setQ] = useState('');
  const [tab, setTab] = useState('all');
  const [open, setOpen] = useState(null);
  const list = db.invoices.filter((i) => {
    if (tab === 'due' && (i.cancelled || invoiceDue(i) <= 0.5)) return false;
    if (tab === 'paid' && (i.cancelled || invoiceDue(i) > 0.5)) return false;
    if (tab === 'cancelled' && !i.cancelled) return false;
    return (i.no + i.customerName).toLowerCase().includes(q.toLowerCase());
  }).slice().reverse();
  const shown = list.slice(0, 200);

  const exportCsv = () => downloadCsv('invoices.csv', [
    ['Invoice', 'Date', 'Customer', 'Taxable', 'GST', 'Total', 'Paid', 'Due', 'Status'],
    ...list.map((i) => [i.no, date(i.date), i.customerName, i.taxable, i.tax, i.total, i.paid, invoiceDue(i), status(i).label]),
  ]);

  return (
    <div className="page">
      <PageHead title="Invoices" sub={`${db.invoices.length} invoices on record`}>
        <DemoLeft kind="invoice" />
        <button className="btn" onClick={exportCsv}><Icon name="download" />Export CSV</button>
        <a className="btn primary" href="#/pos"><Icon name="plus" />New bill</a>
      </PageHead>
      <div className="card">
        <div className="card-head wrap">
          <Tabs value={tab} onChange={setTab} items={[['all', 'All'], ['due', 'Unpaid'], ['paid', 'Paid'], ['cancelled', 'Cancelled']]} />
          <div style={{ width: 280 }}><Search value={q} onChange={setQ} placeholder="Invoice no. or customer" /></div>
        </div>
        <div className="table-wrap">
          <table className="t">
            <thead><tr><th>Invoice</th><th>Date</th><th>Customer</th><th className="num">Total</th><th className="num">Balance</th><th>Status</th></tr></thead>
            <tbody>
              {shown.map((i) => {
                const s = status(i);
                return (
                  <tr key={i.id} className="click" onClick={() => setOpen(i.id)}>
                    <td className="strong">{i.no}</td><td>{dateTime(i.date)}</td><td>{i.customerName}</td>
                    <td className="num">{money(i.total)}</td><td className="num">{money(invoiceDue(i))}</td>
                    <td><span className={`badge ${s.tone}`}>{s.label}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!shown.length && <Empty icon="invoice" text="No invoices found." />}
        </div>
      </div>
      {open && <InvoiceView id={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

export function status(i) {
  if (i.cancelled) return { label: 'Cancelled', tone: '' };
  const due = invoiceDue(i);
  if (due <= 0.5) return { label: 'Paid', tone: 'ok' };
  if (new Date(i.dueDate) < new Date()) return { label: 'Overdue', tone: 'bad' };
  return { label: i.paid > 0 ? 'Part paid' : 'Credit', tone: 'warn' };
}

export function InvoiceView({ id, onClose }) {
  const { db, update, toast } = useStore();
  const [cancelAsk, setCancelAsk] = useState(false);
  const inv = db.invoices.find((i) => i.id === id);
  const cust = db.customers.find((c) => c.id === inv.customerId);

  const cancel = (a) => {
    update((d) => {
      const x = d.invoices.find((i) => i.id === id);
      x.cancelled = { by: a.byName, at: new Date().toISOString(), note: a.note };
      for (const l of x.items) moveStock(d, l.productId, l.qty * l.factor, 'cancel', x.no);
      const pl = d.picklists.find((p) => p.invoiceId === id && p.status !== 'dispatched');
      if (pl) pl.status = 'cancelled';
    }, ['Cancelled invoice', 'Invoice', `${inv.no} · ${money(inv.total)} · approved by ${a.byName}: ${a.note}`]);
    toast('Invoice cancelled; stock returned');
    setCancelAsk(false);
  };

  return (
    <Modal wide title={`Invoice ${inv.no}`} onClose={onClose} footer={<>
      {!inv.cancelled && <button className="btn danger" onClick={() => setCancelAsk(true)}><Icon name="trash" />Cancel invoice</button>}
      <div className="grow" />
      {cust?.phone && <a className="btn" target="_blank" rel="noreferrer" href={waLink(cust.phone, `Invoice ${inv.no} from ${db.company.name}: ${money(inv.total)}. Balance due ${money(invoiceDue(inv))}.`)}><Icon name="whatsapp" />WhatsApp</a>}
      <button className="btn" onClick={() => printThermal(db, inv)}><Icon name="print" />Thermal</button>
      <button className="btn primary" onClick={() => printGstInvoice(db, inv)}><Icon name="print" />GST invoice (A5)</button>
    </>}>
      <div className="grid g3" style={{ marginBottom: 16 }}>
        <div><div className="small muted">Customer</div><b>{inv.customerName}</b></div>
        <div><div className="small muted">Date · Due</div>{dateTime(inv.date)} · {date(inv.dueDate)}</div>
        <div><div className="small muted">Status</div><span className={`badge ${status(inv).tone}`}>{status(inv).label}</span></div>
      </div>
      {inv.cancelled && <div className="alert bad" style={{ marginBottom: 12 }}><Icon name="x" />Cancelled by {inv.cancelled.by}: {inv.cancelled.note}</div>}
      <div className="table-wrap"><table className="t">
        <thead><tr><th>Item</th><th className="num">Qty</th><th className="num">Rate</th><th className="num">Discount</th><th className="num">Taxable</th><th className="num">GST</th><th className="num">Amount</th></tr></thead>
        <tbody>{inv.items.map((l, k) => <tr key={k}><td>{l.name}</td><td className="num">{qty(l.qty)} {l.unit}</td><td className="num">{money(l.rate)}</td><td className="num">{money(l.discount)}</td><td className="num">{money(l.taxable)}</td><td className="num">{money(l.tax)}</td><td className="num">{money(l.total)}</td></tr>)}</tbody>
        <tfoot><tr><td colSpan={4}>Total {inv.roundOff ? `(round off ${money(inv.roundOff)})` : ''}</td><td className="num">{money(inv.taxable)}</td><td className="num">{money(inv.tax)}</td><td className="num">{money(inv.total)}</td></tr></tfoot>
      </table></div>
      <div className="grid g2 mt">
        <div><h3>Payments</h3>{inv.payments.length ? inv.payments.map((p, k) => <div key={k} className="row between small" style={{ padding: '4px 0' }}><span>{p.mode.toUpperCase()} {p.ref && `· ${p.ref}`} {p.at && `· ${date(p.at)}`}</span><b>{money(p.amount)}</b></div>) : <p className="small muted">Fully on credit.</p>}</div>
        <div className="small">
          {inv.approval && <div className="alert info"><Icon name="check" />Discount {inv.manualDiscPct}% approved by {inv.approval.byName}</div>}
          {inv.override && <div className="alert warn mt"><Icon name="lock" />Credit override by {inv.override.byName}: {inv.override.note}</div>}
        </div>
      </div>
      {cancelAsk && <ApprovalModal title="Cancel invoice" reason={`Cancelling ${inv.no} returns its stock and removes ${money(inv.total)} from sales. Owner or sales manager approval is required.`} needNote
        approvers={db.users.filter((u) => u.active && ['owner', 'sales_manager'].includes(u.role))} onClose={() => setCancelAsk(false)} onApproved={cancel} />}
    </Modal>
  );
}
