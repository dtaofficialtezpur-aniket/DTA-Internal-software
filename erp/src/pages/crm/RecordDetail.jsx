import { useState } from 'react';
import { useStore } from '../../lib/store.jsx';
import { activitiesOf, ACTIVITY_KEYS, CRM_MODULES, DEAL_STAGES, display, fieldOf, localDate, shiftDate } from '../../lib/crmMeta.js';
import { addNote, convertLead, deleteRecords, updateRecord } from '../../lib/crmOps.js';
import { waLink } from '../../lib/calc.js';
import { dateTime } from '../../lib/format.js';
import { Empty, Field, Icon, Modal, Tabs } from '../../components/ui.jsx';
import { Avatar, Cell, defaultsFor, FieldInput, go, RecordForm, TONE } from './parts.jsx';
import { ICON_TINT, MODULE_COLORS, tint } from '../../lib/iconColors.js';

// Child records listed on a parent's page: [module, link field, label].
const CHILDREN = {
  accounts: [['contacts', 'accountId', 'Contacts'], ['deals', 'accountId', 'Deals']],
  contacts: [['deals', 'contactId', 'Deals']],
  campaigns: [['leads', 'campaignId', 'Leads'], ['deals', 'campaignId', 'Deals']],
};

export default function RecordDetail({ mod, id }) {
  const { db, user, update, toast } = useStore();
  const m = CRM_MODULES[mod];
  const rec = db.crm[mod].find((r) => r.id === id);
  const [tab, setTab] = useState('overview');
  const [dialog, setDialog] = useState(null);
  const [note, setNote] = useState('');
  if (!rec) return <div className="page"><Empty icon={m.icon} text={`This ${m.singular.toLowerCase()} no longer exists.`} /><button className="btn" onClick={() => go(mod)}>Back to {m.label}</button></div>;

  const acts = activitiesOf(db, mod, id);
  const open = acts.filter((a) => !CRM_MODULES[a._mod].done(a));
  const closed = acts.filter((a) => CRM_MODULES[a._mod].done(a));
  const notes = db.crm.notes.filter((n) => n.module === mod && n.recordId === id);
  const timeline = db.crm.timeline.filter((t) => t.module === mod && t.recordId === id);
  const ownerName = db.users.find((u) => u.id === rec.ownerId)?.name;
  const save = (patch) => update((d) => updateRecord(d, mod, id, patch, user), [`Edited ${m.singular.toLowerCase()}`, m.singular, rec[m.title]]);
  const remove = () => {
    if (!confirm(`Delete this ${m.singular.toLowerCase()}?`)) return;
    update((d) => deleteRecords(d, mod, [id]), [`Deleted ${m.singular.toLowerCase()}`, m.singular, rec[m.title]]);
    toast(`${m.singular} deleted`); go(mod);
  };
  const ids = db.crm[mod].map((r) => r.id);
  const idx = ids.indexOf(id);

  return (
    <div className="page crm-detail">
      <div className="detail-head card">
        <button className="btn ghost icon-btn" onClick={() => go(mod)} aria-label={`Back to ${m.label}`}><Icon name="chevronLeft" /></button>
        <Avatar name={rec[m.title]} size={46} />
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="small muted">{m.singular}{rec.converted && <span className="badge ok" style={{ marginLeft: 8 }}>Converted</span>}</div>
          <h1 style={{ fontSize: 22 }}>{rec[m.title]}</h1>
          <div className="small muted">{[rec[m.subtitle], rec.company, ownerName && `Owner: ${ownerName}`].filter(Boolean).join(' · ')}</div>
        </div>
        <div className="actions">
          {rec.email && <a className="btn" href={`mailto:${rec.email}`}><Icon name="mail" style={{ color: ICON_TINT.mail }} />Send Email</a>}
          {rec.phone && <a className="btn" target="_blank" rel="noreferrer" href={waLink(rec.phone, `Namaskar ${rec.name || ''}, this is ${db.company.name}, Tezpur.`)}><Icon name="whatsapp" style={{ color: ICON_TINT.whatsapp }} />WhatsApp</a>}
          {mod === 'leads' && !rec.converted && <button className="btn gold" onClick={() => setDialog({ kind: 'convert' })}><Icon name="convert" />Convert</button>}
          <button className="btn primary" onClick={() => setDialog({ kind: 'edit' })}><Icon name="edit" />Edit</button>
          <button className="btn icon-btn" title="Clone" onClick={() => { const { id: _i, createdAt, modifiedAt, touched, converted, convertedTo, ...rest } = rec; setDialog({ kind: 'clone', record: { ...rest, [m.title]: `${rec[m.title]} (copy)` } }); }} aria-label="Clone"><Icon name="copy" /></button>
          <button className="btn icon-btn danger" title="Delete" onClick={remove} aria-label="Delete"><Icon name="trash" /></button>
          <button className="btn ghost icon-btn" disabled={idx <= 0} onClick={() => go(`${mod}/${ids[idx - 1]}`)} aria-label="Previous record"><Icon name="chevronLeft" /></button>
          <button className="btn ghost icon-btn" disabled={idx >= ids.length - 1} onClick={() => go(`${mod}/${ids[idx + 1]}`)} aria-label="Next record"><Icon name="chevronRight" /></button>
        </div>
      </div>

      {mod === 'deals' && (
        <div className="stage-path">
          {DEAL_STAGES.map(([s, p]) => (
            <button key={s} className={`${rec.stage === s ? 'on' : ''} ${s === 'Closed Won' ? 'won' : s === 'Closed Lost' ? 'lost' : ''} ${DEAL_STAGES.findIndex(([x]) => x === rec.stage) > DEAL_STAGES.findIndex(([x]) => x === s) && !s.startsWith('Closed') ? 'past' : ''}`}
              onClick={() => { save({ stage: s }); toast(`Stage: ${s} (${p}%)`); }}>{s}</button>
          ))}
        </div>
      )}
      {rec.converted && rec.convertedTo && (
        <div className="alert ok" style={{ marginBottom: 14 }}><Icon name="convert" /><div>Converted to account <a href={`#/accounts/${rec.convertedTo.accountId}`}>{display(db, { type: 'lookup', module: 'accounts' }, rec.convertedTo.accountId)}</a>, contact <a href={`#/contacts/${rec.convertedTo.contactId}`}>{display(db, { type: 'lookup', module: 'contacts' }, rec.convertedTo.contactId)}</a>{rec.convertedTo.dealId && <> and deal <a href={`#/deals/${rec.convertedTo.dealId}`}>{display(db, { type: 'lookup', module: 'deals' }, rec.convertedTo.dealId)}</a></>}.</div></div>
      )}

      <div className="detail-body">
        <nav className="card related-nav">
          <div className="small muted strong" style={{ padding: '4px 10px 8px', textTransform: 'uppercase', letterSpacing: '.08em', fontSize: 10.5 }}>Related list</div>
          {[['notes', `Notes (${notes.length})`], ...(!m.activity ? [['open', `Open Activities (${open.length})`], ['closed', `Closed Activities (${closed.length})`]] : []),
            ...(CHILDREN[mod] || []).map(([cm, , l]) => [cm, `${l} (${db.crm[cm].filter((r) => r[CHILDREN[mod].find((c) => c[0] === cm)[1]] === id).length})`])].map(([k, l]) => (
            <a key={k} href={`#/${mod}/${id}`} onClick={(e) => { e.preventDefault(); setTab('overview'); setTimeout(() => document.getElementById('rel-' + k)?.scrollIntoView({ behavior: 'smooth', block: 'start' })); }}>{l}</a>
          ))}
          <a href={`#/${mod}/${id}`} onClick={(e) => { e.preventDefault(); setTab('timeline'); }}>Timeline ({timeline.length})</a>
        </nav>

        <div className="grid" style={{ gap: 14 }}>
          <Tabs value={tab} onChange={setTab} items={[['overview', 'Overview'], ['timeline', 'Timeline']]} />
          {tab === 'overview' ? (
            <>
              {m.sections.map(([title, keys]) => (
                <div className="card" key={title}>
                  <div className="card-head"><h3>{title}</h3><span className="small muted">Click a value to edit</span></div>
                  <div className="card-body detail-grid">{keys.map((k) => <InlineField key={k} mod={mod} rec={rec} field={fieldOf(mod, k)} onSave={(v) => save({ [k]: v })} />)}</div>
                </div>
              ))}

              <div className="card" id="rel-notes">
                <div className="card-head"><h3>Notes</h3></div>
                <div className="card-body grid">
                  <div className="row"><input className="input grow" placeholder="Add a note…" value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && note.trim() && (update((d) => addNote(d, mod, id, note.trim(), user), ['Added note', m.singular, rec[m.title]]), setNote(''))} />
                    <button className="btn primary" disabled={!note.trim()} onClick={() => { update((d) => addNote(d, mod, id, note.trim(), user), ['Added note', m.singular, rec[m.title]]); setNote(''); }}>Save</button></div>
                  {notes.map((n) => <div key={n.id} className="note"><div className="small"><b>{n.by}</b> <span className="muted">· {dateTime(n.at)}</span></div><div>{n.text}</div></div>)}
                  {!notes.length && <p className="small muted">No notes yet.</p>}
                </div>
              </div>

              {!m.activity && <>
                <ActivityList id="rel-open" title="Open Activities" rows={open} onAdd={(k) => setDialog({ kind: 'activity', mod: k })} />
                <ActivityList id="rel-closed" title="Closed Activities" rows={closed} />
              </>}

              {(CHILDREN[mod] || []).map(([cm, link, label]) => {
                const rows = db.crm[cm].filter((r) => r[link] === id);
                const cmeta = CRM_MODULES[cm];
                return (
                  <div className="card" id={'rel-' + cm} key={cm}>
                    <div className="card-head"><h3>{label}</h3><button className="btn sm" onClick={() => setDialog({ kind: 'child', mod: cm, record: defaultsFor(cm, user, { [link]: id }) })}><Icon name="plus" />New {cmeta.singular}</button></div>
                    <div className="table-wrap"><table className="t"><tbody>{rows.map((r) => (
                      <tr key={r.id} className="click" onClick={() => go(`${cm}/${r.id}`)}>{cmeta.columns.slice(0, 5).map((k) => <td key={k}>{k === cmeta.title ? <b className="rec-link">{r[k]}</b> : <Cell mod={cm} field={fieldOf(cm, k)} rec={r} />}</td>)}</tr>
                    ))}</tbody></table>{!rows.length && <p className="small muted card-body">No {label.toLowerCase()} yet.</p>}</div>
                  </div>
                );
              })}
            </>
          ) : (
            <div className="card"><div className="card-body">
              <div className="timeline" style={{ maxHeight: 'none' }}>
                {timeline.map((t) => <div key={t.id} className="tl-item"><div className="small"><b>{t.by}</b> <span className="muted">· {dateTime(t.at)}</span></div><div className="small">{t.text}</div></div>)}
              </div>
              {!timeline.length && <p className="small muted">No history yet.</p>}
            </div></div>
          )}
        </div>
      </div>

      {dialog?.kind === 'edit' && <RecordForm mod={mod} record={rec} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'clone' && <RecordForm mod={mod} record={dialog.record} onClose={() => setDialog(null)} onSaved={(r) => go(`${mod}/${r.id}`)} />}
      {dialog?.kind === 'activity' && <RecordForm mod={dialog.mod} record={defaultsFor(dialog.mod, user, { relatedTo: { module: mod, id } })} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'child' && <RecordForm mod={dialog.mod} record={dialog.record} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'convert' && <ConvertDialog lead={rec} onClose={() => setDialog(null)} />}
    </div>
  );
}

function InlineField({ mod, rec, field, onSave }) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(rec[field.key]);
  const commit = () => {
    setEditing(false);
    const val = ['currency', 'number', 'percent'].includes(field.type) && v !== '' && v != null ? Number(v) : v;
    if (JSON.stringify(val ?? '') !== JSON.stringify(rec[field.key] ?? '')) onSave(val);
  };
  return (
    <div className={`df ${field.type === 'textarea' ? 'wide' : ''}`}>
      <span className="df-label">{field.label}</span>
      {editing ? (
        <div className="row" style={{ gap: 6 }} onKeyDown={(e) => { if (e.key === 'Enter' && field.type !== 'textarea') commit(); if (e.key === 'Escape') setEditing(false); }}>
          <div className="grow"><FieldInput field={field} value={v} onChange={setV} autoFocus /></div>
          <button className="btn sm primary icon-btn" onClick={commit} aria-label="Save"><Icon name="check" /></button>
          <button className="btn sm icon-btn" onClick={() => setEditing(false)} aria-label="Cancel"><Icon name="x" /></button>
        </div>
      ) : (
        <button className="df-value" onClick={() => { setV(rec[field.key]); setEditing(true); }}>{rec[field.key] !== '' && rec[field.key] != null && !(field.type === 'related' && !rec[field.key]?.id) ? <Cell mod={mod} field={field} rec={rec} /> : <span className="muted">—</span>}<Icon name="edit" className="df-pen" /></button>
      )}
    </div>
  );
}

function ActivityList({ id, title, rows, onAdd }) {
  const { db, user, update, toast } = useStore();
  const done = (a) => {
    const patch = a._mod === 'tasks' ? { status: 'Completed' } : a._mod === 'meetings' ? { status: 'Held' } : { status: 'Completed' };
    update((d) => updateRecord(d, a._mod, a.id, patch, user), [`Completed ${CRM_MODULES[a._mod].singular.toLowerCase()}`, CRM_MODULES[a._mod].singular, a[CRM_MODULES[a._mod].title]]);
    toast('Marked complete');
  };
  return (
    <div className="card" id={id}>
      <div className="card-head"><h3>{title}</h3>{onAdd && <div className="actions">{ACTIVITY_KEYS.map((k) => <button key={k} className="btn sm" onClick={() => onAdd(k)}><Icon name="plus" />{CRM_MODULES[k].singular}</button>)}</div>}</div>
      <div className="table-wrap"><table className="t"><tbody>
        {rows.sort((a, b) => String(a[CRM_MODULES[a._mod].dateField]).localeCompare(String(b[CRM_MODULES[b._mod].dateField]))).map((a) => {
          const am = CRM_MODULES[a._mod];
          const when = a[am.dateField];
          const late = onAdd && when && String(when).slice(0, 10) < localDate();
          return (
            <tr key={a.id} className="click" onClick={() => go(`${a._mod}/${a.id}`)}>
              <td style={{ width: 34 }}><span className="mini-ic" style={tint(MODULE_COLORS[a._mod])}><Icon name={am.icon} /></span></td>
              <td><b className="rec-link">{a[am.title]}</b><div className="small muted">{am.singular} · {db.users.find((u) => u.id === a.ownerId)?.name}</div></td>
              <td className="small" style={late ? { color: 'var(--bad)' } : undefined}>{display(db, fieldOf(a._mod, am.dateField), when)}</td>
              <td><span className={`badge ${TONE[a.status] || ''}`}>{a.status}</span></td>
              <td className="right" onClick={(e) => e.stopPropagation()}>{onAdd && <button className="btn sm" onClick={() => done(a)}><Icon name="check" />Done</button>}</td>
            </tr>
          );
        })}
      </tbody></table>{!rows.length && <p className="small muted card-body">None.</p>}</div>
    </div>
  );
}

function ConvertDialog({ lead, onClose }) {
  const { db, user, update, toast, guard } = useStore();
  const existing = db.crm.accounts.find((a) => a.name.toLowerCase() === String(lead.company || '').toLowerCase());
  const [o, setO] = useState({ accountId: existing?.id || '', accountName: lead.company || lead.name, deal: true, dealName: `${lead.company || lead.name} – ${lead.requirement || 'Order'}`.slice(0, 80), amount: lead.value || '', stage: 'Qualification', closingDate: shiftDate(30), customer: true });
  const run = () => {
    if (!o.accountId && !guard('crm_accounts')) return;
    if (!guard('crm_contacts')) return;
    if (o.deal && !guard('crm_deals')) return;
    const res = update((d) => {
      const r = convertLead(d, lead.id, o, user);
      d.demoUsage ||= {};
      for (const k of [!o.accountId && 'crm_accounts', 'crm_contacts', o.deal && 'crm_deals'].filter(Boolean)) d.demoUsage[k] = (d.demoUsage[k] || 0) + 1;
      return r;
    }, ['Converted lead', 'Lead', `${lead.name} → account, contact${o.deal ? ', deal' : ''}${o.customer ? ', billing customer' : ''}`]);
    toast('Lead converted');
    onClose();
    go(`contacts/${res.contactId}`);
  };
  return (
    <Modal title={`Convert lead — ${lead.name}`} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={run}><Icon name="convert" />Convert</button></>}>
      <div className="grid">
        <Field label="Account"><select className="input" value={o.accountId} onChange={(e) => setO({ ...o, accountId: e.target.value })}><option value="">Create new account</option>{db.crm.accounts.map((a) => <option key={a.id} value={a.id}>Add to existing: {a.name}</option>)}</select></Field>
        {!o.accountId && <Field label="New account name"><input className="input" value={o.accountName} onChange={(e) => setO({ ...o, accountName: e.target.value })} /></Field>}
        <div className="alert info"><Icon name="user" />A contact "{lead.name}" will be created under this account; open activities move to the contact.</div>
        <label className="row"><input type="checkbox" checked={o.deal} onChange={(e) => setO({ ...o, deal: e.target.checked })} /> Create a new deal for this account</label>
        {o.deal && (
          <div className="grid g2">
            <div style={{ gridColumn: '1 / -1' }}><Field label="Deal name"><input className="input" value={o.dealName} onChange={(e) => setO({ ...o, dealName: e.target.value })} /></Field></div>
            <Field label="Amount (₹)"><input className="input num" value={o.amount} onChange={(e) => setO({ ...o, amount: e.target.value.replace(/[^\d.]/g, '') })} /></Field>
            <Field label="Stage"><select className="input" value={o.stage} onChange={(e) => setO({ ...o, stage: e.target.value })}>{DEAL_STAGES.slice(0, 4).map(([s]) => <option key={s}>{s}</option>)}</select></Field>
            <Field label="Closing date"><input className="input" type="date" value={o.closingDate} onChange={(e) => setO({ ...o, closingDate: e.target.value })} /></Field>
          </div>
        )}
        <label className="row"><input type="checkbox" checked={o.customer} onChange={(e) => setO({ ...o, customer: e.target.checked })} /> Also create a billing customer (for POS invoices)</label>
      </div>
    </Modal>
  );
}
