import { useState } from 'react';
import { useStore } from '../lib/store.jsx';
import { agingBuckets, creditScore, customerLedger, invoiceDue } from '../lib/calc.js';
import { money, date, uid } from '../lib/format.js';
import { DemoLeft, Empty, Field, HBar, Icon, Modal, PageHead, Search, Tabs } from '../components/ui.jsx';
import { status } from './Sales.jsx';

const blankCustomer = { name: '', phone: '', gstin: '', address: '', groupId: 'g-retail', parentId: '', creditLimit: 0, creditDays: 0, stateCode: '18' };

export default function Customers() {
  const { db, user } = useStore();
  const [tab, setTab] = useState('customers');
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState(null);
  const [view, setView] = useState(null);
  const [group, setGroup] = useState(null);
  const canEdit = ['owner', 'sales_manager', 'accounts'].includes(user.role);
  const list = db.customers.filter((c) => c.id !== 'walkin' && (c.name + (c.phone || '')).toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="page">
      <PageHead title="Customers" sub="Customer accounts, hierarchy, groups and credit standing">
        {canEdit && tab === 'customers' && <DemoLeft kind="customer" />}
        {canEdit && tab === 'customers' && <button className="btn primary" onClick={() => setEdit({ ...blankCustomer })}><Icon name="plus" />Add customer</button>}
        {canEdit && tab === 'groups' && <button className="btn primary" onClick={() => setGroup({ name: '', pricelistId: db.pricelists[0].id, discount: 0 })}><Icon name="plus" />Add group</button>}
      </PageHead>
      <div className="card">
        <div className="card-head wrap">
          <Tabs value={tab} onChange={setTab} items={[['customers', 'Customers'], ['groups', 'Customer groups']]} />
          {tab === 'customers' && <div style={{ width: 280 }}><Search value={q} onChange={setQ} placeholder="Name or phone" /></div>}
        </div>
        {tab === 'customers' ? (
          <div className="table-wrap"><table className="t">
            <thead><tr><th>Customer</th><th>Group</th><th>Parent account</th><th className="num">Credit limit</th><th className="num">Outstanding</th><th>Score</th></tr></thead>
            <tbody>
              {list.map((c) => {
                const l = customerLedger(db, c.id);
                const s = creditScore(db, c);
                return (
                  <tr key={c.id} className="click" onClick={() => setView(c.id)}>
                    <td><div className="strong">{c.name}</div><div className="small muted">{c.phone}</div></td>
                    <td>{db.customerGroups.find((g) => g.id === c.groupId)?.name}</td>
                    <td className="small">{db.customers.find((p) => p.id === c.parentId)?.name || '—'}</td>
                    <td className="num">{money(c.creditLimit)}</td>
                    <td className="num">{money(l.outstanding)}{l.overdue.length > 0 && <div className="small" style={{ color: 'var(--bad)' }}>{money(l.overdueAmt)} overdue</div>}</td>
                    <td><ScoreBadge s={s} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>{!list.length && <Empty icon="users" text="No customers found." />}</div>
        ) : (
          <div className="table-wrap"><table className="t">
            <thead><tr><th>Group</th><th>Pricelist</th><th className="num">Group discount</th><th className="num">Customers</th><th /></tr></thead>
            <tbody>{db.customerGroups.map((g) => (
              <tr key={g.id}><td className="strong">{g.name}</td><td>{db.pricelists.find((p) => p.id === g.pricelistId)?.name}</td><td className="num">{g.discount}%</td>
                <td className="num">{db.customers.filter((c) => c.groupId === g.id).length}</td>
                <td className="right">{canEdit && <button className="btn sm" onClick={() => setGroup(g)}><Icon name="edit" />Edit</button>}</td></tr>
            ))}</tbody>
          </table></div>
        )}
      </div>
      {edit && <CustomerForm value={edit} onClose={() => setEdit(null)} />}
      {view && <CustomerView id={view} onClose={() => setView(null)} onEdit={(c) => { setView(null); setEdit(c); }} canEdit={canEdit} />}
      {group && <GroupForm value={group} onClose={() => setGroup(null)} />}
    </div>
  );
}

export function ScoreBadge({ s }) {
  return <span className={`badge ${s.grade === 'A' ? 'ok' : s.grade === 'B' ? 'blue' : s.grade === 'C' ? 'warn' : 'bad'}`} title={s.note}>{s.score} · {s.grade}</span>;
}

function CustomerForm({ value, onClose }) {
  const { db, update, toast, guard } = useStore();
  const [f, setF] = useState(value);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = () => {
    if (!f.name.trim()) return;
    const rec = { ...f, name: f.name.trim(), creditLimit: Number(f.creditLimit) || 0, creditDays: Number(f.creditDays) || 0 };
    if (!rec.id && !guard('customer')) return;
    update((d) => {
      if (rec.id) Object.assign(d.customers.find((c) => c.id === rec.id), rec);
      else d.customers.push({ ...rec, id: uid('c') });
    }, [rec.id ? 'Edited customer' : 'Added customer', 'Customer', `${rec.name} · limit ${money(rec.creditLimit)}, ${rec.creditDays} days`], rec.id ? null : 'customer');
    toast('Customer saved');
    onClose();
  };
  return (
    <Modal title={f.id ? 'Edit customer' : 'Add customer'} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save}>Save</button></>}>
      <div className="grid g2">
        <Field label="Name"><input className="input" value={f.name} onChange={set('name')} autoFocus /></Field>
        <Field label="Phone / WhatsApp"><input className="input" value={f.phone} onChange={set('phone')} /></Field>
        <Field label="Customer group"><select className="input" value={f.groupId} onChange={set('groupId')}>{db.customerGroups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></Field>
        <Field label="Parent account" hint="For branches or sub-accounts"><select className="input" value={f.parentId || ''} onChange={set('parentId')}><option value="">None</option>{db.customers.filter((c) => c.id !== 'walkin' && c.id !== f.id).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
        <Field label="Credit limit (₹)"><input className="input num" value={f.creditLimit} onChange={set('creditLimit')} inputMode="decimal" /></Field>
        <Field label="Credit days"><input className="input num" value={f.creditDays} onChange={set('creditDays')} inputMode="numeric" /></Field>
        <Field label="GSTIN"><input className="input" value={f.gstin || ''} onChange={set('gstin')} /></Field>
        <Field label="State code" hint="18 = Assam; other states bill IGST"><input className="input" value={f.stateCode} onChange={set('stateCode')} /></Field>
      </div>
      <div className="mt"><Field label="Address"><textarea className="input" rows={2} value={f.address || ''} onChange={set('address')} /></Field></div>
    </Modal>
  );
}

function GroupForm({ value, onClose }) {
  const { db, update, toast, guard } = useStore();
  const [f, setF] = useState(value);
  const save = () => {
    if (!f.name.trim()) return;
    if (!f.id && !guard('group')) return;
    update((d) => {
      const rec = { ...f, discount: Number(f.discount) || 0 };
      if (rec.id) Object.assign(d.customerGroups.find((g) => g.id === rec.id), rec);
      else d.customerGroups.push({ ...rec, id: uid('g') });
    }, [f.id ? 'Edited customer group' : 'Added customer group', 'Customer group', `${f.name} · ${f.discount}%`], f.id ? null : 'group');
    toast('Group saved');
    onClose();
  };
  return (
    <Modal title={f.id ? 'Edit group' : 'Add group'} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save}>Save</button></>}>
      <div className="grid">
        <Field label="Group name"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus /></Field>
        <Field label="Pricelist"><select className="input" value={f.pricelistId} onChange={(e) => setF({ ...f, pricelistId: e.target.value })}>{db.pricelists.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
        <Field label="Automatic group discount (%)" hint="Applied on every bill, no approval needed"><input className="input num" value={f.discount} onChange={(e) => setF({ ...f, discount: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}

function CustomerView({ id, onClose, onEdit, canEdit }) {
  const { db } = useStore();
  const c = db.customers.find((x) => x.id === id);
  const l = customerLedger(db, id);
  const s = creditScore(db, c);
  const aging = agingBuckets(db, l.invs);
  const children = db.customers.filter((x) => x.parentId === id);
  const receipts = db.receipts.filter((r) => r.customerId === id).slice(-5).reverse();
  return (
    <Modal wide title={c.name} onClose={onClose} footer={canEdit && <button className="btn" onClick={() => onEdit(c)}><Icon name="edit" />Edit</button>}>
      <div className="grid g4 stagger">
        <div className="card stat"><div className="label">Credit score</div><div className="value">{s.score} <span className="small muted">/ 100</span></div><div className="sub">Grade {s.grade} · {s.note}</div></div>
        <div className="card stat gold"><div className="label">Outstanding</div><div className="value">{money(l.outstanding)}</div><div className="sub">Limit {money(c.creditLimit)}</div></div>
        <div className="card stat red"><div className="label">Overdue</div><div className="value">{money(l.overdueAmt)}</div><div className="sub">{l.overdue.length} invoices</div></div>
        <div className="card stat green"><div className="label">Lifetime sales</div><div className="value">{money(l.invs.reduce((a, i) => a + i.total, 0))}</div><div className="sub">{l.invs.length} invoices</div></div>
      </div>
      <div className="mt"><div className="small muted" style={{ marginBottom: 6 }}>Credit limit used</div><HBar pct={c.creditLimit ? l.outstanding / c.creditLimit * 100 : 0} tone={l.outstanding > c.creditLimit * 0.9 ? 'red' : ''} /></div>
      <div className="grid g2 mt">
        <div>
          <h3 style={{ marginBottom: 8 }}>Ageing</h3>
          {Object.entries(aging).map(([k, v]) => <div key={k} className="row between small" style={{ padding: '3px 0' }}><span>{k === 'current' ? 'Not yet due' : `${k} days overdue`}</span><b>{money(v)}</b></div>)}
          {children.length > 0 && <><h3 className="mt" style={{ marginBottom: 6 }}>Branch / sub-accounts</h3>{children.map((x) => <div key={x.id} className="small">{x.name}</div>)}</>}
        </div>
        <div>
          <h3 style={{ marginBottom: 8 }}>Recent receipts</h3>
          {receipts.length ? receipts.map((r) => <div key={r.id} className="row between small" style={{ padding: '3px 0' }}><span>{r.no} · {date(r.date)} · {r.mode}</span><b>{money(r.amount)}</b></div>) : <p className="small muted">None yet.</p>}
        </div>
      </div>
      <h3 className="mt" style={{ marginBottom: 8 }}>Unpaid invoices</h3>
      <table className="t"><thead><tr><th>Invoice</th><th>Date</th><th>Due</th><th className="num">Balance</th><th>Status</th></tr></thead>
        <tbody>{l.invs.filter((i) => invoiceDue(i) > 0.5).map((i) => <tr key={i.id}><td>{i.no}</td><td>{date(i.date)}</td><td>{date(i.dueDate)}</td><td className="num">{money(invoiceDue(i))}</td><td><span className={`badge ${status(i).tone}`}>{status(i).label}</span></td></tr>)}</tbody>
      </table>
    </Modal>
  );
}
