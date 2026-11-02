import { useEffect, useState } from 'react';
import { useStore } from '../../lib/store.jsx';
import { CRM_MODULES, display, fieldOf, localDate } from '../../lib/crmMeta.js';
import { createRecord, updateRecord } from '../../lib/crmOps.js';
import { Field, Icon, Modal } from '../../components/ui.jsx';

// Current hash path split into parts, e.g. ['leads', 'le1'].
export function useRoute() {
  const read = () => location.hash.replace(/^#\/?/, '').split('?')[0].split('/');
  const [parts, setParts] = useState(read);
  useEffect(() => { const h = () => setParts(read()); window.addEventListener('hashchange', h); return () => window.removeEventListener('hashchange', h); }, []);
  return parts;
}

export const go = (path) => { location.hash = '/' + path; };
export const initials = (s = '') => s.split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

const RELATABLE = ['leads', 'contacts', 'accounts', 'deals'];

export function FieldInput({ field, value, onChange, autoFocus }) {
  const { db } = useStore();
  const p = { className: 'input', value: value ?? '', autoFocus, onChange: (e) => onChange(e.target.value) };
  switch (field.type) {
    case 'textarea': return <textarea {...p} rows={3} />;
    case 'select': return <select {...p}><option value="">-None-</option>{field.options.map((o) => <option key={o}>{o}</option>)}</select>;
    case 'owner': return <select {...p}>{db.users.filter((u) => u.active).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>;
    case 'lookup': return <select {...p}><option value="">-None-</option>{db.crm[field.module].map((r) => <option key={r.id} value={r.id}>{r[CRM_MODULES[field.module].title]}</option>)}</select>;
    case 'related': {
      const v = value || { module: 'leads', id: '' };
      return (
        <div className="row" style={{ gap: 6 }}>
          <select className="input" style={{ width: 120 }} value={v.module} onChange={(e) => onChange({ module: e.target.value, id: '' })}>{RELATABLE.map((m) => <option key={m} value={m}>{CRM_MODULES[m].singular}</option>)}</select>
          <select className="input grow" value={v.id} onChange={(e) => onChange({ module: v.module, id: e.target.value })}><option value="">-None-</option>{db.crm[v.module].map((r) => <option key={r.id} value={r.id}>{r[CRM_MODULES[v.module].title]}</option>)}</select>
        </div>
      );
    }
    case 'currency': case 'number': case 'percent': return <input {...p} className="input num" inputMode="decimal" onChange={(e) => onChange(e.target.value.replace(/[^\d.-]/g, ''))} />;
    case 'date': return <input {...p} type="date" />;
    case 'datetime': return <input {...p} type="datetime-local" />;
    case 'email': return <input {...p} type="email" />;
    case 'phone': return <input {...p} type="tel" />;
    default: return <input {...p} />;
  }
}

export function defaultsFor(mod, user, extra = {}) {
  const r = { ownerId: user.id };
  if (mod === 'leads') Object.assign(r, { status: 'Not Contacted', rating: 'Warm', followUp: localDate() });
  if (mod === 'deals') Object.assign(r, { stage: 'Qualification', type: 'New Business' });
  if (mod === 'tasks') Object.assign(r, { status: 'Not Started', priority: 'Normal', dueDate: localDate() });
  if (mod === 'meetings') { const d = new Date(); d.setHours(d.getHours() + 1, 0, 0, 0); const t = (x) => `${localDate(x)}T${String(x.getHours()).padStart(2, '0')}:00`; const e = new Date(d); e.setHours(d.getHours() + 1); Object.assign(r, { status: 'Planned', from: t(d), to: t(e) }); }
  if (mod === 'calls') Object.assign(r, { callType: 'Outbound', status: 'Scheduled', callTime: `${localDate()}T${String(new Date().getHours() + 1).padStart(2, '0')}:00` });
  if (mod === 'campaigns') Object.assign(r, { status: 'Planning', startDate: localDate() });
  return { ...r, ...extra };
}

const clean = (mod, f) => {
  const out = { ...f };
  for (const fl of CRM_MODULES[mod].fields) if (['currency', 'number', 'percent'].includes(fl.type) && out[fl.key] !== '' && out[fl.key] != null) out[fl.key] = Number(out[fl.key]);
  return out;
};

// Create / edit dialog generated from the module's sections.
export function RecordForm({ mod, record, onClose, onSaved }) {
  const { user, update, toast, guard } = useStore();
  const m = CRM_MODULES[mod];
  const [f, setF] = useState(record);
  const [err, setErr] = useState('');
  const save = (again) => {
    const missing = m.fields.filter((fl) => fl.required && !String(f[fl.key] ?? '').trim());
    if (missing.length) return setErr(`Please fill: ${missing.map((x) => x.label).join(', ')}`);
    const data = clean(mod, f);
    if (!f.id && !guard('crm_' + mod)) return;
    const rec = update((d) => (f.id ? updateRecord(d, mod, f.id, data, user) : createRecord(d, mod, data, user)),
      [f.id ? `Edited ${m.singular.toLowerCase()}` : `Created ${m.singular.toLowerCase()}`, m.singular, data[m.title]], f.id ? null : 'crm_' + mod);
    toast(`${m.singular} saved`);
    if (again) { setF(defaultsFor(mod, user)); setErr(''); return; }
    onSaved?.(rec);
    onClose();
  };
  return (
    <Modal wide title={f.id ? `Edit ${m.singular}` : `Create ${m.singular}`} onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>Cancel</button>
      {!f.id && <button className="btn" onClick={() => save(true)}>Save and New</button>}
      <button className="btn primary" onClick={() => save(false)}>Save</button>
    </>}>
      {m.sections.map(([title, keys], si) => (
        <div key={title} style={{ marginTop: si ? 18 : 0 }}>
          <div className="form-section">{title}</div>
          <div className="grid g2">
            {keys.map((k, i) => {
              const fl = fieldOf(mod, k);
              return (
                <div key={k} style={fl.type === 'textarea' ? { gridColumn: '1 / -1' } : undefined}>
                  <Field label={<>{fl.label}{fl.required && <span style={{ color: 'var(--bad)' }}> *</span>}</>}>
                    <FieldInput field={fl} value={f[k]} autoFocus={si === 0 && i === 0} onChange={(v) => setF((x) => ({ ...x, [k]: v }))} />
                  </Field>
                </div>
              );
            })}
          </div>
        </div>
      ))}
      {err && <div className="alert bad mt"><Icon name="alert" />{err}</div>}
    </Modal>
  );
}

export function Avatar({ name, size = 30 }) {
  const hue = [...(name || '')].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 0);
  return <span className="crm-avatar" style={{ width: size, height: size, fontSize: size * 0.38, background: `hsl(${hue} 45% 92%)`, color: `hsl(${hue} 45% 30%)` }}>{initials(name)}</span>;
}

export function Cell({ mod, field, rec }) {
  const { db } = useStore();
  const v = rec[field.key];
  if (field.type === 'email' && v) return <a href={`mailto:${v}`} onClick={(e) => e.stopPropagation()}>{v}</a>;
  if (field.type === 'phone' && v) return <a className="row" style={{ gap: 6, display: 'inline-flex' }} href={`tel:${v}`} onClick={(e) => e.stopPropagation()}>{v}<Icon name="phone" style={{ width: 14, height: 14 }} /></a>;
  if (field.type === 'lookup' && v) return <a href={`#/${field.module}/${v}`} onClick={(e) => e.stopPropagation()}>{display(db, field, v)}</a>;
  if (field.type === 'related' && v?.id) return <a href={`#/${v.module}/${v.id}`} onClick={(e) => e.stopPropagation()}>{display(db, field, v)}</a>;
  if (field.type === 'select' && v) return <span className={`badge ${TONE[v] || ''}`}>{v}</span>;
  if (field.type === 'date' && v && mod !== 'contacts') {
    const late = v < localDate() && !(CRM_MODULES[mod].done?.(rec)) && ['followUp', 'dueDate', 'closingDate'].includes(field.key) && !String(rec.stage || '').startsWith('Closed');
    return <span style={late ? { color: 'var(--bad)', fontWeight: 500 } : undefined}>{display(db, field, v)}</span>;
  }
  return <>{display(db, field, v)}</>;
}

export const TONE = {
  Hot: 'bad', Warm: 'warn', Cold: 'blue', Qualified: 'ok', 'Junk Lead': '', 'Lost Lead': 'bad', 'Not Contacted': 'blue', Contacted: 'gold',
  'Closed Won': 'ok', 'Closed Lost': 'bad', Negotiation: 'gold', 'Quotation Sent': 'warn', Completed: 'ok', 'In Progress': 'gold', 'Not Started': 'blue',
  High: 'bad', Normal: 'blue', Low: '', Planned: 'blue', Held: 'ok', Cancelled: 'bad', Active: 'ok', Planning: 'blue', Scheduled: 'warn', 'Key account': 'gold',
};
