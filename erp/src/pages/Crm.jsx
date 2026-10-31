import { useState } from 'react';
import { useStore } from '../lib/store.jsx';
import { loyaltyOf, TIERS, waLink } from '../lib/calc.js';
import { money, date, dateTime, nowIso, uid } from '../lib/format.js';
import { DemoLeft, Empty, Field, Icon, Modal, PageHead, Search, Stat, Tabs } from '../components/ui.jsx';

const STAGES = [['new', 'New', 'blue'], ['contacted', 'Contacted', ''], ['quoted', 'Quotation sent', 'gold'], ['won', 'Won', 'ok'], ['lost', 'Lost', 'bad']];
const SOURCES = ['Walk-in', 'Phone', 'WhatsApp', 'Referral', 'Field visit', 'Govt. tender', 'Website'];

export default function Crm() {
  const { db, user } = useStore();
  const [tab, setTab] = useState('pipeline');
  const [open, setOpen] = useState(null);
  const today = new Date().toISOString().slice(0, 10);
  const active = db.leads.filter((l) => !['won', 'lost'].includes(l.stage));
  const due = active.filter((l) => l.followUp && l.followUp <= today);
  const won = db.leads.filter((l) => l.stage === 'won');
  const closed = won.length + db.leads.filter((l) => l.stage === 'lost').length;

  return (
    <div className="page">
      <PageHead title="Leads & Loyalty" sub="Enquiries, follow-ups and customer rewards">
        {tab !== 'loyalty' && <DemoLeft kind="lead" />}
        {tab !== 'loyalty' && <button className="btn primary" onClick={() => setOpen({ name: '', contact: '', phone: '', source: 'Walk-in', need: '', value: '', stage: 'new', followUp: today, ownerId: user.id, notes: [] })}><Icon name="plus" />New lead</button>}
      </PageHead>
      <div className="grid g4 stagger">
        <Stat label="Open pipeline" value={active.reduce((s, l) => s + Number(l.value || 0), 0)} sub={`${active.length} open leads`} icon="target" />
        <Stat label="Follow-ups due" value={due.length} money={false} sub="today or overdue" icon="clock" tone={due.length ? 'red' : 'green'} />
        <Stat label="Won value" value={won.reduce((s, l) => s + Number(l.value || 0), 0)} sub={`${won.length} deals`} icon="check" tone="green" />
        <Stat label="Win rate" value={closed ? Math.round(won.length / closed * 100) : 0} money={false} sub="% of closed leads" icon="chart" tone="gold" />
      </div>
      <div className="mt" style={{ marginBottom: 14 }}><Tabs value={tab} onChange={setTab} items={[['pipeline', 'Pipeline'], ['followups', `Follow-ups (${due.length})`], ['loyalty', 'Loyalty programme']]} /></div>
      {tab === 'pipeline' && <Pipeline onOpen={setOpen} />}
      {tab === 'followups' && <FollowUps rows={due} onOpen={setOpen} />}
      {tab === 'loyalty' && <Loyalty />}
      {open && <LeadModal value={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function Pipeline({ onOpen }) {
  const { db } = useStore();
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="kanban stagger">
      {STAGES.map(([k, label, tone]) => {
        const items = db.leads.filter((l) => l.stage === k);
        return (
          <div className="card" key={k}>
            <div className="card-head"><div><h3>{label}</h3><p>{money(items.reduce((s, l) => s + Number(l.value || 0), 0))}</p></div><span className={`badge ${tone || 'blue'}`}>{items.length}</span></div>
            <div className="grid" style={{ padding: 10, gap: 8 }}>
              {items.map((l) => (
                <button key={l.id} className="prod" onClick={() => onOpen(l)}>
                  <div className="small strong">{l.name}</div>
                  <div className="small muted" style={{ marginTop: 3 }}>{l.need}</div>
                  <div className="row between small" style={{ marginTop: 6 }}><b>{money(l.value)}</b>
                    {l.followUp && !['won', 'lost'].includes(k) && <span className={`badge ${l.followUp < today ? 'bad' : l.followUp === today ? 'warn' : ''}`}>{date(l.followUp)}</span>}</div>
                </button>
              ))}
              {!items.length && <div className="small muted" style={{ padding: 12, textAlign: 'center' }}>Empty</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function FollowUps({ rows, onOpen }) {
  const { db } = useStore();
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="card"><div className="table-wrap"><table className="t">
      <thead><tr><th>Lead</th><th>Contact</th><th>Stage</th><th>Follow-up</th><th>Owner</th><th /></tr></thead>
      <tbody>{rows.sort((a, b) => a.followUp.localeCompare(b.followUp)).map((l) => (
        <tr key={l.id}><td className="strong">{l.name}<div className="small muted">{l.need}</div></td><td>{l.contact}<div className="small muted">{l.phone}</div></td>
          <td>{STAGES.find(([k]) => k === l.stage)[1]}</td><td><span className={`badge ${l.followUp < today ? 'bad' : 'warn'}`}>{l.followUp < today ? `Overdue · ${date(l.followUp)}` : 'Today'}</span></td>
          <td>{db.users.find((u) => u.id === l.ownerId)?.name}</td>
          <td className="right"><div className="actions" style={{ justifyContent: 'flex-end' }}>
            {l.phone && <a className="btn sm" target="_blank" rel="noreferrer" href={waLink(l.phone, `Namaskar ${l.contact}, this is ${db.company.name}, Tezpur, following up on your requirement: ${l.need}.`)}><Icon name="whatsapp" />WhatsApp</a>}
            <button className="btn sm primary" onClick={() => onOpen(l)}>Open</button></div></td></tr>
      ))}</tbody>
    </table>{!rows.length && <Empty icon="check" text="No follow-ups due. Good work." />}</div></div>
  );
}

function LeadModal({ value, onClose }) {
  const { db, user, update, toast, guard } = useStore();
  const [f, setF] = useState(structuredClone(value));
  const [note, setNote] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = (patch = {}, msg = 'Lead saved') => {
    const rec = { ...f, ...patch, value: Number(f.value) || 0 };
    if (!rec.name.trim()) return toast('Enter a lead name', 'bad');
    if (note.trim()) rec.notes = [...rec.notes, { at: nowIso(), by: user.name, text: note.trim() }];
    if (rec.stage === 'lost' && !rec.lostReason) return toast('Record why the lead was lost', 'bad');
    if (!rec.id && !guard('lead')) return;
    update((d) => {
      if (rec.id) Object.assign(d.leads.find((l) => l.id === rec.id), rec);
      else { const n = ++d.seq.LD; d.leads.push({ ...rec, id: uid('ld'), no: 'LD-' + String(n).padStart(3, '0'), created: nowIso() }); }
    }, [rec.id ? `Lead ${STAGES.find(([k]) => k === rec.stage)[1].toLowerCase()}` : 'New lead', 'Lead', `${rec.name} · ${money(rec.value)}`], rec.id ? null : 'lead');
    toast(msg); onClose();
  };
  const convert = () => {
    if (db.customers.some((c) => c.name === f.name)) return toast('A customer with this name already exists', 'bad');
    if (!guard('customer')) return;
    update((d) => {
      d.customers.push({ id: uid('c'), name: f.name, phone: f.phone, groupId: 'g-b2b', creditLimit: 0, creditDays: 0, stateCode: '18', address: '' });
      Object.assign(d.leads.find((l) => l.id === f.id), { stage: 'won', converted: true });
    }, ['Converted lead to customer', 'Lead', f.name], 'customer');
    toast('Customer created — set the credit limit under Customers'); onClose();
  };
  return (
    <Modal wide title={f.id ? `${f.no} · ${f.name}` : 'New lead'} onClose={onClose} footer={<>
      {f.id && f.stage === 'won' && !f.converted && <button className="btn gold" onClick={convert}><Icon name="user" />Convert to customer</button>}
      <div className="grow" />
      <button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={() => save()}>Save</button>
    </>}>
      <div className="stage-bar">
        {STAGES.map(([k, label]) => <button key={k} className={`stage ${f.stage === k ? 'on' : ''} ${k}`} onClick={() => setF({ ...f, stage: k })}>{label}</button>)}
      </div>
      <div className="grid g3 mt">
        <div style={{ gridColumn: 'span 2' }}><Field label="Lead / project"><input className="input" autoFocus={!f.id} value={f.name} onChange={set('name')} /></Field></div>
        <Field label="Estimated value (₹)"><input className="input num" value={f.value} onChange={(e) => setF({ ...f, value: e.target.value.replace(/\D/g, '') })} /></Field>
        <Field label="Contact person"><input className="input" value={f.contact} onChange={set('contact')} /></Field>
        <Field label="Phone / WhatsApp"><input className="input" value={f.phone} onChange={set('phone')} /></Field>
        <Field label="Source"><select className="input" value={f.source} onChange={set('source')}>{SOURCES.map((s) => <option key={s}>{s}</option>)}</select></Field>
        <div style={{ gridColumn: 'span 2' }}><Field label="Requirement"><input className="input" value={f.need} onChange={set('need')} /></Field></div>
        <Field label="Next follow-up"><input className="input" type="date" value={f.followUp} onChange={set('followUp')} /></Field>
        <Field label="Owner"><select className="input" value={f.ownerId} onChange={set('ownerId')}>{db.users.filter((u) => ['owner', 'sales_manager', 'salesman'].includes(u.role)).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></Field>
        {f.stage === 'lost' && <div style={{ gridColumn: 'span 2' }}><Field label="Reason lost"><input className="input" value={f.lostReason || ''} onChange={set('lostReason')} /></Field></div>}
      </div>
      <h3 className="mt" style={{ marginBottom: 8 }}>Activity</h3>
      <div className="timeline">
        {f.notes.slice().reverse().map((n, i) => <div key={i} className="tl-item"><div className="small"><b>{n.by}</b> <span className="muted">· {dateTime(n.at)}</span></div><div className="small">{n.text}</div></div>)}
        {!f.notes.length && <p className="small muted">No notes yet.</p>}
      </div>
      <div className="mt"><Field label="Add a note (call summary, site visit, quotation sent…)"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></Field></div>
    </Modal>
  );
}

function Loyalty() {
  const { db, user, update, toast } = useStore();
  const [q, setQ] = useState('');
  const [adjust, setAdjust] = useState(null);
  const [rules, setRules] = useState(db.settings.loyalty);
  const members = db.customers.filter((c) => c.id !== 'walkin' && c.name.toLowerCase().includes(q.toLowerCase()))
    .map((c) => ({ c, l: loyaltyOf(db, c.id) })).sort((a, b) => b.l.balance - a.l.balance);
  const liability = members.reduce((s, m) => s + m.l.balance, 0) * db.settings.loyalty.pointValue;
  const canEdit = user.role === 'owner';
  return (
    <div className="grid g-main">
      <div className="card">
        <div className="card-head"><div><h3>Members</h3><p>Outstanding points worth {money(liability)}</p></div><div style={{ width: 240 }}><Search value={q} onChange={setQ} placeholder="Customer" /></div></div>
        <div className="table-wrap"><table className="t">
          <thead><tr><th>Customer</th><th>Tier</th><th className="num">Earned</th><th className="num">Balance</th><th className="num">Worth</th><th /></tr></thead>
          <tbody>{members.map(({ c, l }) => (
            <tr key={c.id}><td className="strong">{c.name}</td><td><span className={`badge ${l.tier === 'Platinum' ? 'blue' : l.tier === 'Gold' ? 'gold' : ''}`}>{l.tier}</span></td>
              <td className="num">{l.earned.toLocaleString('en-IN')}</td><td className="num strong">{l.balance.toLocaleString('en-IN')}</td><td className="num">{money(l.balance * db.settings.loyalty.pointValue)}</td>
              <td className="right">{canEdit && <button className="btn sm" onClick={() => setAdjust({ c, points: '', note: '' })}>Adjust</button>}</td></tr>
          ))}</tbody>
        </table></div>
      </div>
      <div className="card">
        <div className="card-head"><h3>Programme rules</h3></div>
        <div className="card-body grid">
          <label className="row"><input type="checkbox" checked={rules.enabled} disabled={!canEdit} onChange={(e) => setRules({ ...rules, enabled: e.target.checked })} /> Programme active</label>
          <div className="grid g2">
            <Field label="Points per ₹100 billed"><input className="input num" disabled={!canEdit} value={rules.pointsPer100} onChange={(e) => setRules({ ...rules, pointsPer100: e.target.value })} /></Field>
            <Field label="Value of 1 point (₹)"><input className="input num" disabled={!canEdit} value={rules.pointValue} onChange={(e) => setRules({ ...rules, pointValue: e.target.value })} /></Field>
            <Field label="Minimum to redeem"><input className="input num" disabled={!canEdit} value={rules.minRedeem} onChange={(e) => setRules({ ...rules, minRedeem: e.target.value })} /></Field>
          </div>
          <div className="small">{TIERS.slice().reverse().map(([t, min, mult]) => <div key={t} className="row between" style={{ padding: '3px 0' }}><span><b>{t}</b> · from {min.toLocaleString('en-IN')} points earned</span><span>{mult}× points</span></div>)}</div>
          <p className="small muted">Points are earned automatically on every bill for registered customers and can be redeemed at the counter.</p>
          {canEdit && <button className="btn primary" onClick={() => {
            const r = { enabled: rules.enabled, pointsPer100: Number(rules.pointsPer100) || 0, pointValue: Number(rules.pointValue) || 0, minRedeem: Number(rules.minRedeem) || 0 };
            update((d) => { d.settings.loyalty = r; }, ['Changed loyalty rules', 'Settings', `${r.pointsPer100} pts / ₹100, 1 pt = ₹${r.pointValue}`]);
            toast('Loyalty rules saved');
          }}>Save rules</button>}
        </div>
      </div>
      {adjust && <Modal title={`Adjust points — ${adjust.c.name}`} onClose={() => setAdjust(null)} footer={<><button className="btn" onClick={() => setAdjust(null)}>Cancel</button><button className="btn primary" onClick={() => {
        const pts = Math.round(Number(adjust.points));
        if (!pts || !adjust.note.trim()) return toast('Enter points and a reason', 'bad');
        update((d) => { d.loyalty.push({ id: uid('ly'), customerId: adjust.c.id, at: nowIso(), points: pts, ref: 'Manual', note: adjust.note }); }, ['Adjusted loyalty points', 'Loyalty', `${adjust.c.name} · ${pts > 0 ? '+' : ''}${pts} · ${adjust.note}`]);
        toast('Points adjusted'); setAdjust(null);
      }}>Save</button></>}>
        <div className="grid g2">
          <Field label="Points (negative to deduct)"><input className="input num" autoFocus value={adjust.points} onChange={(e) => setAdjust({ ...adjust, points: e.target.value.replace(/[^\d-]/g, '') })} /></Field>
          <Field label="Reason"><input className="input" value={adjust.note} onChange={(e) => setAdjust({ ...adjust, note: e.target.value })} /></Field>
        </div>
      </Modal>}
    </div>
  );
}
