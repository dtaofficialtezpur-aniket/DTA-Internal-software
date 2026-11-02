import { useState } from 'react';
import { useStore } from '../../lib/store.jsx';
import { CRM_KEYS, CRM_MODULES, DEAL_STAGES, display, fieldOf, localDate } from '../../lib/crmMeta.js';
import { updateRecord } from '../../lib/crmOps.js';
import { money, dateTime } from '../../lib/format.js';
import { Empty, HBar, Icon, Stat } from '../../components/ui.jsx';
import { defaultsFor, DueChip, go, RecordForm } from './parts.jsx';
import { ICON_TINT, MODULE_COLORS, tint } from '../../lib/iconColors.js';

export default function CrmHome() {
  const { db, user, update, toast } = useStore();
  const [form, setForm] = useState(null);
  const today = localDate();
  const c = db.crm;
  const myTasks = c.tasks.filter((t) => t.ownerId === user.id && t.status !== 'Completed').sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const allOpenTasks = c.tasks.filter((t) => t.status !== 'Completed');
  const tasks = (myTasks.length ? myTasks : allOpenTasks).slice(0, 6);
  const meetings = c.meetings.filter((mt) => mt.from.slice(0, 10) >= today && mt.status === 'Planned').sort((a, b) => a.from.localeCompare(b.from)).slice(0, 5);
  const openDeals = c.deals.filter((d) => !d.stage.startsWith('Closed'));
  const byStage = DEAL_STAGES.map(([s]) => [s, c.deals.filter((d) => d.stage === s)]);
  const maxStage = Math.max(1, ...byStage.map(([, ds]) => ds.reduce((x, d) => x + d.amount, 0)));
  const bySource = {};
  for (const l of c.leads) bySource[l.source || '-None-'] = (bySource[l.source || '-None-'] || 0) + 1;
  const recent = CRM_KEYS.flatMap((k) => c[k].map((r) => ({ ...r, _mod: k }))).sort((a, b) => (b.modifiedAt || '').localeCompare(a.modifiedAt || '')).slice(0, 8);
  const hour = new Date().getHours();
  const setup = [
    ['users', 'Invite your team', 'Add salesmen and give each a login and role.', () => go('users'), db.users.length > 7],
    ['kanban', 'Configure your deals pipeline', 'Track every order from enquiry to closed won.', () => go('deals'), c.deals.length > 0],
    ['upload', 'Migrate your existing data', 'Import leads, contacts and accounts from Excel (CSV).', () => go('leads'), c.leads.length > 10],
    ['whatsapp', 'Connect WhatsApp', 'Send follow-ups and offers in one click from any record.', () => go('leads'), true],
    ['mail', 'Connect your email account', 'Two-way email sync arrives with the cloud version.', null, false],
  ];

  return (
    <div className="page">
      <div className="crm-hello card">
        <div>
          <div className="small" style={{ color: 'var(--accent)', letterSpacing: '.12em', textTransform: 'uppercase', fontWeight: 600 }}>CRM Home</div>
          <h1 style={{ marginTop: 6 }}>Good {hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'}, {user.name.split(' ')[0]}</h1>
          <p className="muted" style={{ marginTop: 6 }}>{myTasks.length} open task(s) · {meetings.length} upcoming meeting(s) · {openDeals.length} open deal(s) worth {money(openDeals.reduce((s, d) => s + d.amount, 0))}</p>
          <div className="row wrap" style={{ marginTop: 16 }}>
            {['leads', 'deals', 'tasks', 'meetings', 'calls'].map((k) => <button key={k} className="btn sm" onClick={() => setForm(k)}><Icon name={CRM_MODULES[k].icon} style={{ color: MODULE_COLORS[k] }} />{CRM_MODULES[k].singular}</button>)}
          </div>
        </div>
        <div className="setup">
          <h3>Set up your CRM</h3>
          {setup.map(([icon, title, sub, fn, done]) => (
            <button key={title} className="setup-item" onClick={fn || undefined} disabled={!fn}>
              <span className={`mini-ic ${done ? 'green' : ''}`} style={done ? undefined : tint(ICON_TINT[icon] || '#2a78d6')}><Icon name={done ? 'check' : icon} /></span>
              <span className="grow" style={{ textAlign: 'left' }}><b className="small">{title}</b><span className="small muted" style={{ display: 'block' }}>{sub}</span></span>
              {fn && <Icon name="chevronRight" style={{ width: 16, height: 16, color: 'var(--muted)' }} />}
            </button>
          ))}
        </div>
      </div>

      <div className="grid g4 mt stagger">
        <Stat label="Open leads" value={c.leads.filter((l) => !l.converted && !['Junk Lead', 'Lost Lead'].includes(l.status)).length} money={false} icon="target" sub={`${c.leads.filter((l) => l.followUp && l.followUp <= today && !l.converted).length} follow-ups due`} />
        <Stat label="Pipeline value" value={openDeals.reduce((s, d) => s + d.amount, 0)} icon="briefcase" tone="gold" sub={`Weighted ${money(openDeals.reduce((s, d) => s + d.amount * (d.probability || 0) / 100, 0))}`} />
        <Stat label="Won this month" value={c.deals.filter((d) => d.stage === 'Closed Won' && d.closingDate.slice(0, 7) === today.slice(0, 7)).reduce((s, d) => s + d.amount, 0)} icon="check" tone="green" />
        <Stat label="Overdue tasks" value={allOpenTasks.filter((t) => t.dueDate < today).length} money={false} icon="alert" tone="red" />
      </div>

      <div className="grid g3 mt stagger">
        <div className="card">
          <div className="card-head"><h3>{myTasks.length ? 'My open tasks' : 'Open tasks'}</h3><a className="btn sm ghost" href="#/tasks">All tasks</a></div>
          {tasks.map((t) => (
            <div className="list-row" key={t.id}>
              <input type="checkbox" aria-label="Mark complete" onChange={() => { update((d) => updateRecord(d, 'tasks', t.id, { status: 'Completed' }, user), ['Completed task', 'Task', t.subject]); toast('Task completed'); }} />
              <a className="grow small" href={`#/tasks/${t.id}`} style={{ color: 'inherit', textDecoration: 'none' }}><b>{t.subject}</b><div className="muted">{display(db, fieldOf('tasks', 'relatedTo'), t.relatedTo)}</div></a>
              <DueChip value={t.dueDate} />
            </div>
          ))}
          {!tasks.length && <Empty icon="check" text="No open tasks." />}
        </div>
        <div className="card">
          <div className="card-head"><h3>Upcoming meetings</h3><a className="btn sm ghost" href="#/meetings">All meetings</a></div>
          {meetings.map((mt) => (
            <a className="list-row" key={mt.id} href={`#/meetings/${mt.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
              <div className="cal-chip"><b>{new Date(mt.from).getDate()}</b><span>{new Date(mt.from).toLocaleDateString('en-IN', { month: 'short' })}</span></div>
              <div className="grow small"><b>{mt.title}</b><div className="muted">{dateTime(mt.from)} · {mt.location}</div></div>
            </a>
          ))}
          {!meetings.length && <Empty icon="clock" text="No meetings planned." />}
        </div>
        <div className="card">
          <div className="card-head"><h3>Leads by source</h3><a className="btn sm ghost" href="#/leads">All leads</a></div>
          <div className="card-body grid" style={{ gap: 10 }}>
            {Object.entries(bySource).sort((a, b) => b[1] - a[1]).map(([s, n]) => <div key={s}><div className="row between small"><span>{s}</span><b>{n}</b></div><HBar pct={n / c.leads.length * 100} tone="gold" /></div>)}
          </div>
        </div>
      </div>

      <div className="grid g-main mt stagger">
        <div className="card">
          <div className="card-head"><div><h3>Deals pipeline</h3><p>Amount by stage</p></div><a className="btn sm ghost" href="#/deals">Open pipeline</a></div>
          <div className="card-body grid" style={{ gap: 12 }}>
            {byStage.map(([s, ds]) => { const v = ds.reduce((x, d) => x + d.amount, 0); return (
              <div key={s}><div className="row between small"><span><b>{s}</b> <span className="muted">· {ds.length} deal(s)</span></span><b>{money(v)}</b></div><HBar pct={v / maxStage * 100} tone={s === 'Closed Won' ? '' : s === 'Closed Lost' ? 'red' : 'gold'} /></div>); })}
          </div>
        </div>
        <div className="card">
          <div className="card-head"><h3>Recently modified</h3></div>
          {recent.map((r) => (
            <a key={r._mod + r.id} className="list-row" href={`#/${r._mod}/${r.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
              <span className="mini-ic" style={tint(MODULE_COLORS[r._mod])}><Icon name={CRM_MODULES[r._mod].icon} /></span>
              <div className="grow small"><b>{r[CRM_MODULES[r._mod].title]}</b><div className="muted">{CRM_MODULES[r._mod].singular} · {dateTime(r.modifiedAt)}</div></div>
            </a>
          ))}
        </div>
      </div>
      {form && <RecordForm mod={form} record={defaultsFor(form, user)} onClose={() => setForm(null)} onSaved={(r) => go(`${form}/${r.id}`)} />}
    </div>
  );
}
