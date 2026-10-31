import { useEffect, useState } from 'react';
import { useStore } from '../lib/store.jsx';
import { money, date, nowIso, uid } from '../lib/format.js';
import { hoursOf, isLate, payrollFor } from '../lib/hr.js';
import { printPayslip } from '../lib/print.js';
import { Empty, Field, Icon, Modal, PageHead, Stat, Tabs } from '../components/ui.jsx';

const time = (iso) => (iso ? new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—');
const STATUS_TONE = { pending: 'warn', approved: 'ok', rejected: 'bad' };

export default function Portal() {
  const { db, user, update, toast } = useStore();
  const [tab, setTab] = useState('attendance');
  const [leave, setLeave] = useState(null);
  const [advance, setAdvance] = useState(null);
  const [clock, setClock] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setClock(new Date()), 1000); return () => clearInterval(t); }, []);

  const today = new Date().toISOString().slice(0, 10);
  const month = today.slice(0, 7);
  const mine = db.hr.attendance.filter((a) => a.userId === user.id);
  const todayRec = mine.find((a) => a.date === today);
  const pay = payrollFor(db, user.id, month);
  const profile = db.hr.profiles[user.id] || {};
  const logins = db.audit.filter((a) => a.userId === user.id && (a.action === 'Logged in' || a.action === 'Logged out')).slice(0, 40);

  const punch = () => update((d) => {
    const rec = d.hr.attendance.find((a) => a.userId === user.id && a.date === today);
    if (!rec) d.hr.attendance.push({ id: uid('at'), userId: user.id, date: today, in: nowIso(), out: '' });
    else rec.out = nowIso();
  }, [todayRec ? 'Punched out' : 'Punched in', 'Attendance', `${user.name} at ${time(nowIso())}`]);

  return (
    <div className="page">
      <PageHead title="My Portal" sub={`${user.name} · ${profile.designation || ''}`} />
      <div className="grid g-main stagger">
        <div className="card" style={{ background: 'linear-gradient(135deg, #1c3a6b, #112446)', color: '#fff', border: 0 }}>
          <div className="card-body row wrap between" style={{ padding: 26, gap: 20 }}>
            <div>
              <div className="small" style={{ color: '#9fb1d1', letterSpacing: '.1em', textTransform: 'uppercase' }}>{clock.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
              <div style={{ fontFamily: 'var(--serif)', fontSize: 40, fontWeight: 600, marginTop: 6 }}>{clock.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</div>
              <div className="small" style={{ color: '#c9d4e8', marginTop: 6 }}>
                {todayRec ? <>In at <b>{time(todayRec.in)}</b>{todayRec.out && <> · Out at <b>{time(todayRec.out)}</b></>}{isLate(db, todayRec) && <span className="badge warn" style={{ marginLeft: 8 }}>Late</span>}</> : `Shift starts ${db.settings.hr.shiftStart}`}
              </div>
            </div>
            <button className="btn gold lg" onClick={punch} disabled={todayRec?.out}><Icon name="clock" />{!todayRec ? 'Punch in' : todayRec.out ? 'Day complete' : 'Punch out'}</button>
          </div>
        </div>
        <div className="grid g2">
          <Stat label="Present this month" value={pay.presentDays} money={false} sub={`of ${pay.elapsed} working days so far`} icon="check" tone="green" />
          <Stat label="Estimated pay" value={pay.net} sub={pay.lop ? `${pay.lop} day(s) loss of pay` : 'No deductions'} icon="wallet" tone="gold" />
        </div>
      </div>

      <div className="card mt">
        <div className="card-head wrap">
          <Tabs value={tab} onChange={setTab} items={[['attendance', 'Attendance'], ['logins', 'Login / logout'], ['leave', 'Leave'], ['advance', 'Advances'], ['slips', 'Salary slips']]} />
          {tab === 'leave' && <button className="btn primary sm" onClick={() => setLeave({ from: today, to: today, type: 'Casual', reason: '' })}><Icon name="plus" />Apply for leave</button>}
          {tab === 'advance' && <button className="btn primary sm" onClick={() => setAdvance({ amount: '', reason: '' })}><Icon name="plus" />Request advance</button>}
        </div>
        {tab === 'attendance' && (
          <div className="table-wrap"><table className="t">
            <thead><tr><th>Date</th><th>In</th><th>Out</th><th className="num">Hours</th><th /></tr></thead>
            <tbody>{mine.slice(-31).reverse().map((a) => (
              <tr key={a.id}><td>{date(a.date)}</td><td>{time(a.in)}</td><td>{time(a.out)}</td><td className="num">{hoursOf(a) || '—'}</td>
                <td>{isLate(db, a) && <span className="badge warn">Late</span>}</td></tr>
            ))}</tbody>
          </table>{!mine.length && <Empty icon="clock" text="No attendance yet. Punch in to start." />}</div>
        )}
        {tab === 'logins' && (
          <div className="table-wrap"><table className="t">
            <thead><tr><th>Time</th><th>Event</th></tr></thead>
            <tbody>{logins.map((a) => <tr key={a.id}><td>{new Date(a.ts).toLocaleString('en-IN')}</td><td><span className={`badge ${a.action === 'Logged in' ? 'ok' : ''}`}>{a.action}</span></td></tr>)}</tbody>
          </table></div>
        )}
        {tab === 'leave' && <Requests rows={db.hr.leaves.filter((l) => l.userId === user.id)} cols={(l) => [`${date(l.from)} – ${date(l.to)}`, `${l.days} day(s) · ${l.type}`, l.reason]} />}
        {tab === 'advance' && <Requests rows={db.hr.advances.filter((a) => a.userId === user.id)} cols={(a) => [date(a.at), money(a.amount), a.reason + (a.recoverMonth ? ` · recovered in ${a.recoverMonth}` : '')]} />}
        {tab === 'slips' && (
          <div className="table-wrap"><table className="t">
            <thead><tr><th>Month</th><th className="num">Gross</th><th className="num">Deductions</th><th className="num">Net pay</th><th /></tr></thead>
            <tbody>{db.hr.payslips.filter((p) => p.userId === user.id).slice().reverse().map((p) => (
              <tr key={p.id}><td className="strong">{p.month}</td><td className="num">{money(p.gross)}</td><td className="num">{money(p.deduction)}</td><td className="num strong">{money(p.net)}</td>
                <td className="right"><button className="btn sm" onClick={() => printPayslip(db, p)}><Icon name="print" />Slip</button></td></tr>
            ))}</tbody>
          </table>{!db.hr.payslips.some((p) => p.userId === user.id) && <Empty icon="invoice" text="Salary slips appear here once payroll is run." />}</div>
        )}
      </div>

      {leave && <Modal title="Apply for leave" onClose={() => setLeave(null)} footer={<><button className="btn" onClick={() => setLeave(null)}>Cancel</button><button className="btn primary" onClick={() => {
        if (leave.to < leave.from || !leave.reason.trim()) return toast('Check the dates and give a reason', 'bad');
        const days = Math.round((new Date(leave.to) - new Date(leave.from)) / 86400000) + 1;
        update((d) => { d.hr.leaves.push({ id: uid('lv'), userId: user.id, ...leave, days, status: 'pending', at: nowIso() }); }, ['Applied for leave', 'Leave', `${user.name} · ${days} day(s) ${leave.type}`]);
        toast('Leave request sent for approval'); setLeave(null);
      }}>Submit</button></>}>
        <div className="grid g2">
          <Field label="From"><input className="input" type="date" value={leave.from} onChange={(e) => setLeave({ ...leave, from: e.target.value })} /></Field>
          <Field label="To"><input className="input" type="date" value={leave.to} onChange={(e) => setLeave({ ...leave, to: e.target.value })} /></Field>
          <Field label="Type"><select className="input" value={leave.type} onChange={(e) => setLeave({ ...leave, type: e.target.value })}>{['Casual', 'Sick', 'Unpaid'].map((t) => <option key={t}>{t}</option>)}</select></Field>
          <Field label="Reason"><input className="input" value={leave.reason} onChange={(e) => setLeave({ ...leave, reason: e.target.value })} /></Field>
        </div>
      </Modal>}
      {advance && <Modal title="Request salary advance" onClose={() => setAdvance(null)} footer={<><button className="btn" onClick={() => setAdvance(null)}>Cancel</button><button className="btn primary" onClick={() => {
        if (!(Number(advance.amount) > 0) || !advance.reason.trim()) return toast('Enter an amount and reason', 'bad');
        update((d) => { d.hr.advances.push({ id: uid('ad'), userId: user.id, amount: Number(advance.amount), reason: advance.reason, status: 'pending', at: nowIso() }); }, ['Requested advance', 'Advance', `${user.name} · ${money(advance.amount)}`]);
        toast('Advance request sent'); setAdvance(null);
      }}>Submit</button></>}>
        <div className="grid g2">
          <Field label="Amount (₹)"><input className="input num" autoFocus value={advance.amount} onChange={(e) => setAdvance({ ...advance, amount: e.target.value.replace(/[^\d]/g, '') })} /></Field>
          <Field label="Reason"><input className="input" value={advance.reason} onChange={(e) => setAdvance({ ...advance, reason: e.target.value })} /></Field>
        </div>
      </Modal>}
    </div>
  );
}

function Requests({ rows, cols }) {
  if (!rows.length) return <Empty icon="invoice" text="No requests yet." />;
  return (
    <div className="table-wrap"><table className="t"><tbody>
      {rows.slice().reverse().map((r) => (
        <tr key={r.id}>{cols(r).map((c, i) => <td key={i} className={i === 0 ? 'strong' : ''}>{c}</td>)}
          <td><span className={`badge ${STATUS_TONE[r.status]}`}>{r.status}</span>{r.decidedBy && <div className="small muted">by {r.decidedBy}</div>}</td></tr>
      ))}
    </tbody></table></div>
  );
}
