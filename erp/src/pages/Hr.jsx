import { useState } from 'react';
import { useStore } from '../lib/store.jsx';
import { ROLES } from '../lib/calc.js';
import { money, date, downloadCsv, nowIso, uid } from '../lib/format.js';
import { hoursOf, isLate, isWorkDay, payrollFor } from '../lib/hr.js';
import { printPayslip } from '../lib/print.js';
import { Empty, Field, Icon, Modal, PageHead, Stat, Tabs } from '../components/ui.jsx';

const time = (iso) => (iso ? new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—');

export default function Hr() {
  const { db } = useStore();
  const [tab, setTab] = useState('attendance');
  const today = new Date().toISOString().slice(0, 10);
  const staff = db.users.filter((u) => u.active && db.hr.profiles[u.id]?.onPayroll);
  const presentToday = db.hr.attendance.filter((a) => a.date === today).length;
  const pendingLeave = db.hr.leaves.filter((l) => l.status === 'pending').length;
  const pendingAdv = db.hr.advances.filter((a) => a.status === 'pending').length;
  const month = today.slice(0, 7);

  return (
    <div className="page">
      <PageHead title="HR & Payroll" sub={`Shift starts ${db.settings.hr.shiftStart} · Monday to Saturday`} />
      <div className="grid g4 stagger">
        <Stat label="Present today" value={presentToday} money={false} sub={`of ${staff.length} on payroll`} icon="check" tone="green" />
        <Stat label="Leave requests" value={pendingLeave} money={false} sub="awaiting approval" icon="clock" tone={pendingLeave ? 'gold' : ''} />
        <Stat label="Advance requests" value={pendingAdv} money={false} sub="awaiting approval" icon="wallet" tone={pendingAdv ? 'gold' : ''} />
        <Stat label="Payroll this month" value={staff.reduce((s, u) => s + payrollFor(db, u.id, month).net, 0)} sub="estimated net to date" icon="briefcase" />
      </div>
      <div className="card mt">
        <div className="card-head wrap"><Tabs value={tab} onChange={setTab} items={[['attendance', 'Attendance'], ['leave', `Leave (${pendingLeave})`], ['advance', `Advances (${pendingAdv})`], ['payroll', 'Payroll'], ['staff', 'Employees']]} /></div>
        {tab === 'attendance' && <Register />}
        {tab === 'leave' && <Approvals kind="leaves" label="Leave" cols={(l) => [`${date(l.from)} – ${date(l.to)}`, `${l.days} day(s) · ${l.type}`, l.reason]} />}
        {tab === 'advance' && <Approvals kind="advances" label="Advance" cols={(a) => [money(a.amount), a.reason, date(a.at)]} />}
        {tab === 'payroll' && <Payroll staff={staff} />}
        {tab === 'staff' && <Staff />}
      </div>
    </div>
  );
}

function Register() {
  const { db } = useStore();
  const [day, setDay] = useState(new Date().toISOString().slice(0, 10));
  const rows = db.users.filter((u) => u.active && db.hr.profiles[u.id]?.onPayroll).map((u) => ({ u, a: db.hr.attendance.find((x) => x.userId === u.id && x.date === day) }));
  const onLeave = (u) => db.hr.leaves.some((l) => l.userId === u.id && l.status === 'approved' && day >= l.from && day <= l.to);
  return (
    <>
      <div className="card-body row wrap" style={{ paddingBottom: 0 }}>
        <Field label="Date"><input className="input" type="date" value={day} onChange={(e) => setDay(e.target.value)} /></Field>
        <button className="btn" style={{ alignSelf: 'flex-end' }} onClick={() => downloadCsv(`attendance-${day.slice(0, 7)}.csv`, [['Date', 'Employee', 'In', 'Out', 'Hours'], ...db.hr.attendance.filter((a) => a.date.startsWith(day.slice(0, 7))).map((a) => [a.date, db.users.find((u) => u.id === a.userId)?.name, time(a.in), time(a.out), hoursOf(a)])])}><Icon name="download" />Month CSV</button>
      </div>
      <div className="table-wrap mt"><table className="t">
        <thead><tr><th>Employee</th><th>Role</th><th>In</th><th>Out</th><th className="num">Hours</th><th>Status</th></tr></thead>
        <tbody>{rows.map(({ u, a }) => (
          <tr key={u.id}><td className="strong">{u.name}</td><td>{ROLES[u.role]}</td><td>{time(a?.in)}</td><td>{time(a?.out)}</td><td className="num">{a ? hoursOf(a) || '—' : '—'}</td>
            <td>{a ? <span className={`badge ${isLate(db, a) ? 'warn' : 'ok'}`}>{isLate(db, a) ? 'Late' : 'Present'}</span> : onLeave(u) ? <span className="badge blue">On leave</span> : !isWorkDay(db, day) ? <span className="badge">Holiday</span> : <span className="badge bad">Absent</span>}</td></tr>
        ))}</tbody>
      </table></div>
    </>
  );
}

function Approvals({ kind, label, cols }) {
  const { db, user, update, toast } = useStore();
  const rows = db.hr[kind].slice().sort((a, b) => (a.status === 'pending' ? -1 : 1) - (b.status === 'pending' ? -1 : 1) || b.at.localeCompare(a.at));
  const thisMonth = new Date().toISOString().slice(0, 7);
  const decide = (r, status) => {
    update((d) => {
      const x = d.hr[kind].find((y) => y.id === r.id);
      Object.assign(x, { status, decidedBy: user.name, decidedAt: nowIso() });
      if (kind === 'advances' && status === 'approved') x.recoverMonth = thisMonth;
    }, [`${status === 'approved' ? 'Approved' : 'Rejected'} ${label.toLowerCase()}`, label, `${db.users.find((u) => u.id === r.userId)?.name} · ${cols(r)[0]}`]);
    toast(`${label} ${status}`);
  };
  if (!rows.length) return <Empty icon="check" text="No requests." />;
  return (
    <div className="table-wrap"><table className="t">
      <tbody>{rows.map((r) => (
        <tr key={r.id}><td className="strong">{db.users.find((u) => u.id === r.userId)?.name}</td>{cols(r).map((c, i) => <td key={i}>{c}</td>)}
          <td className="right">{r.status === 'pending' && user.role === 'owner'
            ? <div className="actions" style={{ justifyContent: 'flex-end' }}><button className="btn sm danger" onClick={() => decide(r, 'rejected')}>Reject</button><button className="btn sm primary" onClick={() => decide(r, 'approved')}>Approve</button></div>
            : <span className={`badge ${r.status === 'approved' ? 'ok' : r.status === 'rejected' ? 'bad' : 'warn'}`}>{r.status}</span>}
            {kind === 'advances' && r.recoverMonth && <div className="small muted">Recover from {r.recoverMonth} salary</div>}</td></tr>
      ))}</tbody>
    </table>{user.role !== 'owner' && <p className="small muted card-body">Only the owner can approve requests.</p>}</div>
  );
}

function Payroll({ staff }) {
  const { db, user, update, toast } = useStore();
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const rows = staff.map((u) => ({ u, p: payrollFor(db, u.id, month), slip: db.hr.payslips.find((s) => s.userId === u.id && s.month === month) }));
  const done = rows.every((r) => r.slip);
  const run = () => {
    if (!confirm(`Finalise payroll for ${month}? Salary slips will be issued to employees.`)) return;
    update((d) => {
      for (const { u, p, slip } of rows) if (!slip) d.hr.payslips.push({ id: uid('ps'), userId: u.id, name: u.name, role: u.role, month, ...p, advances: p.advances.map((a) => ({ amount: a.amount, reason: a.reason })), at: nowIso(), by: user.name });
    }, ['Ran payroll', 'Payroll', `${month} · ${rows.length} employees · net ${money(rows.reduce((s, r) => s + r.p.net, 0))}`]);
    toast(`Payroll for ${month} finalised`);
  };
  return (
    <>
      <div className="card-body row wrap between" style={{ paddingBottom: 0 }}>
        <Field label="Month"><input className="input" type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></Field>
        <div className="actions">
          <button className="btn" onClick={() => downloadCsv(`payroll-${month}.csv`, [['Employee', 'Salary', 'Working days', 'Present', 'Paid leave', 'LOP', 'Gross', 'Advance', 'Net'], ...rows.map(({ u, p }) => [u.name, p.salary, p.workDays, p.presentDays, p.leave, p.lop, p.gross, p.deduction, p.net])])}><Icon name="download" />CSV</button>
          {user.role === 'owner' && <button className="btn primary" onClick={run} disabled={done}><Icon name="check" />{done ? 'Finalised' : 'Finalise payroll'}</button>}
        </div>
      </div>
      <p className="small muted card-body" style={{ paddingTop: 8, paddingBottom: 0 }}>Monthly salary ÷ working days in the month = day rate. Absent days without approved paid leave are deducted (loss of pay). Approved advances are recovered in the month shown.</p>
      <div className="table-wrap mt"><table className="t">
        <thead><tr><th>Employee</th><th className="num">Salary</th><th className="num">Present</th><th className="num">Paid leave</th><th className="num">LOP days</th><th className="num">Gross</th><th className="num">Advance</th><th className="num">Net</th><th /></tr></thead>
        <tbody>{rows.map(({ u, p, slip }) => {
          const v = slip || p;
          return (
            <tr key={u.id}><td className="strong">{u.name}</td><td className="num">{money(v.salary)}</td><td className="num">{v.presentDays}/{v.elapsed}</td><td className="num">{v.leave}</td>
              <td className="num" style={{ color: v.lop ? 'var(--bad)' : undefined }}>{v.lop}</td><td className="num">{money(v.gross)}</td><td className="num">{money(v.deduction)}</td><td className="num strong">{money(v.net)}</td>
              <td className="right">{slip && <button className="btn sm" onClick={() => printPayslip(db, slip)}><Icon name="print" />Slip</button>}</td></tr>
          );
        })}</tbody>
        <tfoot><tr><td colSpan={7}>Total net pay</td><td className="num">{money(rows.reduce((s, r) => s + (r.slip || r.p).net, 0))}</td><td /></tr></tfoot>
      </table></div>
    </>
  );
}

function Staff() {
  const { db, user, update, toast } = useStore();
  const [edit, setEdit] = useState(null);
  return (
    <>
      <div className="table-wrap"><table className="t">
        <thead><tr><th>Employee</th><th>Designation</th><th>Joined</th><th className="num">Monthly salary</th><th>Payroll</th><th /></tr></thead>
        <tbody>{db.users.map((u) => { const p = db.hr.profiles[u.id] || {}; return (
          <tr key={u.id}><td className="strong">{u.name}<div className="small muted">{ROLES[u.role]}</div></td><td>{p.designation}</td><td>{p.joinDate ? date(p.joinDate) : '—'}</td>
            <td className="num">{money(p.salary)}</td><td><span className={`badge ${p.onPayroll ? 'ok' : ''}`}>{p.onPayroll ? 'Yes' : 'No'}</span></td>
            <td className="right">{user.role === 'owner' && <button className="btn sm" onClick={() => setEdit({ id: u.id, name: u.name, ...{ salary: 0, joinDate: '', designation: '', bank: '', onPayroll: true }, ...p })}><Icon name="edit" />Edit</button>}</td></tr>
        ); })}</tbody>
      </table></div>
      <p className="small muted card-body">New employees are added under Users &amp; Roles; set their salary here.</p>
      {edit && <Modal title={`Employee — ${edit.name}`} onClose={() => setEdit(null)} footer={<><button className="btn" onClick={() => setEdit(null)}>Cancel</button><button className="btn primary" onClick={() => {
        const { id, name, ...rest } = edit;
        update((d) => { d.hr.profiles[id] = { ...rest, salary: Number(rest.salary) || 0 }; }, ['Edited employee', 'Employee', `${name} · salary ${money(rest.salary)}`]);
        toast('Employee saved'); setEdit(null);
      }}>Save</button></>}>
        <div className="grid g2">
          <Field label="Designation"><input className="input" value={edit.designation} onChange={(e) => setEdit({ ...edit, designation: e.target.value })} /></Field>
          <Field label="Monthly salary (₹)"><input className="input num" value={edit.salary} onChange={(e) => setEdit({ ...edit, salary: e.target.value.replace(/\D/g, '') })} /></Field>
          <Field label="Joining date"><input className="input" type="date" value={edit.joinDate} onChange={(e) => setEdit({ ...edit, joinDate: e.target.value })} /></Field>
          <Field label="Bank account (for salary)"><input className="input" value={edit.bank} onChange={(e) => setEdit({ ...edit, bank: e.target.value })} /></Field>
        </div>
        <label className="row mt"><input type="checkbox" checked={edit.onPayroll} onChange={(e) => setEdit({ ...edit, onPayroll: e.target.checked })} /> Include in payroll</label>
      </Modal>}
    </>
  );
}

