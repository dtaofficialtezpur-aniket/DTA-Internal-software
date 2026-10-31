import { useState } from 'react';
import { useStore } from '../lib/store.jsx';
import { agingBuckets, creditScore, customerLedger, upiLink, waLink } from '../lib/calc.js';
import { money, date, daysBetween, nowIso, uid } from '../lib/format.js';
import { postReceipt } from '../lib/ops.js';
import { DemoLeft, Empty, Field, Icon, Modal, PageHead, Stat, Tabs } from '../components/ui.jsx';
import { ScoreBadge } from './Customers.jsx';

export default function Collections() {
  const { db, update, toast } = useStore();
  const [tab, setTab] = useState('due');
  const [receive, setReceive] = useState(null);

  const rows = db.customers.filter((c) => c.id !== 'walkin').map((c) => {
    const l = customerLedger(db, c.id);
    const last = db.reminders.filter((r) => r.customerId === c.id).sort((a, b) => b.at.localeCompare(a.at))[0];
    const oldest = l.overdue.reduce((m, i) => Math.max(m, daysBetween(i.dueDate)), 0);
    return { c, l, last, oldest, score: creditScore(db, c), remind: l.overdue.length > 0 && (!last || daysBetween(last.at) >= db.settings.reminderEvery) };
  }).filter((r) => r.l.outstanding > 0.5).sort((a, b) => b.oldest - a.oldest || b.l.outstanding - a.l.outstanding);

  const shown = tab === 'due' ? rows.filter((r) => r.remind) : rows;
  const aging = agingBuckets(db, db.invoices.filter((i) => !i.cancelled));
  const total = rows.reduce((s, r) => s + r.l.outstanding, 0);
  const overdue = rows.reduce((s, r) => s + r.l.overdueAmt, 0);
  const monthKey = new Date().toISOString().slice(0, 7);
  const collected = db.receipts.filter((r) => r.date.slice(0, 7) === monthKey).reduce((s, r) => s + r.amount, 0);

  const remind = (r) => {
    const amt = r.l.overdueAmt || r.l.outstanding;
    const pay = db.company.upiId ? `\nPay by UPI: ${upiLink(db, amt, 'Outstanding ' + r.c.name)}` : '';
    const text = `Dear ${r.c.name},\nThis is a reminder from ${db.company.name}. ${money(amt)} is overdue on ${r.l.overdue.length} invoice(s) (${r.l.overdue.map((i) => i.no).join(', ')}). Total outstanding: ${money(r.l.outstanding)}.${pay}\nKindly arrange payment at the earliest. Thank you.`;
    window.open(waLink(r.c.phone, text), '_blank', 'noopener');
    update((d) => { d.reminders.push({ id: uid('rm'), customerId: r.c.id, at: nowIso(), amount: amt, channel: 'whatsapp' }); }, ['Sent payment reminder', 'Customer', `${r.c.name} · ${money(amt)}`]);
    toast('Reminder logged');
  };

  return (
    <div className="page">
      <PageHead title="Credit & Collections" sub={`Reminders are due every ${db.settings.reminderEvery} days while an invoice is overdue`}><DemoLeft kind="receipt" /></PageHead>
      <div className="grid g4 stagger">
        <Stat label="Total receivable" value={total} icon="wallet" />
        <Stat label="Overdue" value={overdue} icon="alert" tone="red" sub={`${rows.filter((r) => r.l.overdue.length).length} customers`} />
        <Stat label="Collected this month" value={collected} icon="check" tone="green" />
        <Stat label="90+ days" value={aging[`${db.settings.agingBuckets[2]}+`]} icon="clock" tone="gold" />
      </div>
      <div className="card mt">
        <div className="card-head wrap"><Tabs value={tab} onChange={setTab} items={[['due', `Reminders due (${rows.filter((r) => r.remind).length})`], ['all', 'All outstanding']]} /></div>
        <div className="table-wrap"><table className="t">
          <thead><tr><th>Customer</th><th>Score</th><th className="num">Outstanding</th><th className="num">Overdue</th><th>Oldest overdue</th><th>Last reminder</th><th /></tr></thead>
          <tbody>{shown.map((r) => (
            <tr key={r.c.id}>
              <td><div className="strong">{r.c.name}</div><div className="small muted">{r.c.phone}</div></td>
              <td><ScoreBadge s={r.score} /></td>
              <td className="num">{money(r.l.outstanding)}</td>
              <td className="num" style={{ color: r.l.overdueAmt ? 'var(--bad)' : undefined }}>{money(r.l.overdueAmt)}</td>
              <td>{r.oldest ? `${r.oldest} days` : '—'}</td>
              <td className="small">{r.last ? date(r.last.at) : 'Never'}</td>
              <td className="right"><div className="actions" style={{ justifyContent: 'flex-end' }}>
                {r.c.phone && <button className="btn sm" onClick={() => remind(r)}><Icon name="whatsapp" />Remind</button>}
                <button className="btn sm primary" onClick={() => setReceive(r.c)}>Receive</button>
              </div></td>
            </tr>
          ))}</tbody>
        </table>{!shown.length && <Empty icon="check" text={tab === 'due' ? 'No reminders due today.' : 'Nothing outstanding.'} />}</div>
      </div>
      {receive && <ReceiveModal customer={receive} onClose={() => setReceive(null)} />}
    </div>
  );
}

function ReceiveModal({ customer, onClose }) {
  const { db, user, update, toast, guard } = useStore();
  const l = customerLedger(db, customer.id);
  const [amount, setAmount] = useState(String(l.outstanding));
  const [mode, setMode] = useState('bank');
  const [ref, setRef] = useState('');
  const save = () => {
    const amt = Number(amount);
    if (!(amt > 0)) return;
    if (!guard('receipt')) return;
    const rc = update((d) => postReceipt(d, { customerId: customer.id, amount: amt, mode, ref, userId: user.id }),
      ['Received payment', 'Receipt', `${customer.name} · ${money(amt)} · ${mode}${ref ? ' ' + ref : ''}`], 'receipt');
    toast(`Receipt ${rc.no} saved against ${rc.allocations.length} invoice(s)`);
    onClose();
  };
  return (
    <Modal title={`Receive payment — ${customer.name}`} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save}>Save receipt</button></>}>
      <div className="alert info"><Icon name="info" />Outstanding {money(l.outstanding)}. Payment is applied to the oldest invoices first.</div>
      <div className="grid g2 mt">
        <Field label="Amount (₹)"><input className="input num" autoFocus inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} /></Field>
        <Field label="Mode"><select className="input" value={mode} onChange={(e) => setMode(e.target.value)}>{[['cash', 'Cash'], ['upi', 'UPI'], ['cheque', 'Cheque'], ['bank', 'Bank transfer']].map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
      </div>
      <div className="mt"><Field label="Reference (UTR / cheque no.)"><input className="input" value={ref} onChange={(e) => setRef(e.target.value)} /></Field></div>
    </Modal>
  );
}
