import { useState } from 'react';
import { useStore } from '../../lib/store.jsx';
import { groupIds, groupNature, groupPath, ledgerList, ledgerMap, num2, periodPresets, VTYPES, voucherTotal } from '../../lib/accounts.js';
import { money, uid } from '../../lib/format.js';
import { Field, Icon, Modal } from '../../components/ui.jsx';

export const go = (path) => { location.hash = '/' + path; };
// Hand-offs between accounting screens (e.g. Day Book → edit voucher, Trial Balance → ledger).
export const stash = (key, val) => { try { sessionStorage.setItem('stc-acc-' + key, JSON.stringify(val)); } catch { /* ignore */ } };
export const unstash = (key) => { try { const v = JSON.parse(sessionStorage.getItem('stc-acc-' + key)); sessionStorage.removeItem('stc-acc-' + key); return v; } catch { return null; } };

// Preset or custom period.
export function PeriodBar({ value, onChange, label = 'Period', single }) {
  const { db } = useStore();
  const presets = periodPresets(db);
  const set = (preset) => { const p = presets.find(([k]) => k === preset); onChange({ preset, from: p[2], to: p[3] }); };
  return (
    <div className="period-bar">
      <span className="small strong">{label}</span>
      <select className="input" value={value.preset} onChange={(e) => set(e.target.value)} aria-label="Period">
        {presets.map(([k, l]) => <option key={k} value={k}>{l}</option>)}{value.preset === 'custom' && <option value="custom">Custom</option>}
      </select>
      <input className="input" type="date" value={value.from} onChange={(e) => onChange({ preset: 'custom', from: e.target.value, to: single ? e.target.value : value.to })} aria-label="From" />
      {!single && <><span className="small muted">to</span><input className="input" type="date" value={value.to} onChange={(e) => onChange({ preset: 'custom', from: value.from, to: e.target.value })} aria-label="To" /></>}
    </div>
  );
}
export const initialPeriod = (db, preset) => { const p = periodPresets(db).find(([k]) => k === preset); return { preset, from: p[2], to: p[3] }; };

// Type-ahead ledger field: pick by name (datalist), resolves to a ledger id.
export function LedgerInput({ value, onChange, options, listId, placeholder = 'Type or choose a ledger', dataF, dataLast, autoFocus }) {
  const byId = new Map(options.map((l) => [l.id, l]));
  const [text, setText] = useState(byId.get(value)?.name || '');
  return (
    <input className="input" list={listId} value={text} placeholder={placeholder} autoFocus={autoFocus} data-f={dataF} data-last={dataLast}
      onChange={(e) => { setText(e.target.value); const m = options.find((l) => l.name.toLowerCase() === e.target.value.trim().toLowerCase()); onChange(m ? m.id : ''); }}
      style={value || !text ? undefined : { borderColor: 'var(--bad)' }} aria-label="Ledger" />
  );
}

// Principal ledger(s) of a voucher, for list views.
export function particulars(v, names) {
  const dr = v.lines.filter((l) => l.dr).sort((a, b) => b.dr - a.dr), cr = v.lines.filter((l) => l.cr).sort((a, b) => b.cr - a.cr);
  const pick = ['receipt', 'purchase', 'creditnote'].includes(v.type) ? cr : dr;
  const n = names.get(pick[0]?.ledger)?.name || names.get(v.lines[0]?.ledger)?.name || '—';
  return pick.length > 1 ? `${n} +${pick.length - 1} more` : n;
}
export const TypeBadge = ({ type }) => <span className="vtype" style={{ color: VTYPES[type].color, background: VTYPES[type].color + '1a' }}>{VTYPES[type].label}</span>;

export function VoucherView({ v, onClose, onEdit }) {
  const { db, user } = useStore();
  const names = ledgerMap(db);
  const linkTo = { invoice: ['sales', 'Open invoices'], receipt: ['collections', 'Open collections'], po: ['purchase', 'Open purchase orders'] }[v.link?.kind];
  return (
    <Modal wide title={`${VTYPES[v.type].label} voucher ${v.no}`} onClose={onClose} footer={<>
      {linkTo && <button className="btn" onClick={() => { onClose(); go(linkTo[0]); }}><Icon name="invoice" />{linkTo[1]}</button>}
      <div className="grow" />
      {!v.auto && ['owner', 'accounts'].includes(user.role) && <button className="btn primary" onClick={() => onEdit(v)}><Icon name="edit" />Edit voucher</button>}
      <button className="btn" onClick={onClose}>Close</button>
    </>}>
      <div className="row wrap small" style={{ gap: 14, marginBottom: 12 }}>
        <TypeBadge type={v.type} /><span>Date <b>{new Date(v.date + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</b></span>
        {v.auto ? <span className="badge blue">Posted automatically</span> : <span className="muted">By {v.createdBy}</span>}
        {v.ref && <span>Ref <b>{v.ref}</b></span>}
      </div>
      <table className="t">
        <thead><tr><th>Particulars</th><th className="num">Debit</th><th className="num">Credit</th></tr></thead>
        <tbody>{v.lines.map((l, i) => <tr key={i}><td>{l.dr ? 'Dr' : 'Cr'} &nbsp; <b>{names.get(l.ledger)?.name || l.ledger}</b></td><td className="num">{l.dr ? num2(l.dr) : ''}</td><td className="num">{l.cr ? num2(l.cr) : ''}</td></tr>)}</tbody>
        <tfoot><tr><td>Total</td><td className="num">{num2(voucherTotal(v))}</td><td className="num">{num2(v.lines.reduce((s, l) => s + l.cr, 0))}</td></tr></tfoot>
      </table>
      {v.narration && <p className="small mt"><span className="muted">Narration: </span>{v.narration}</p>}
    </Modal>
  );
}

const indent = (db, g) => `${'— '.repeat(Math.max(0, groupPath(db, g.id).length - 1))}${g.name}`;
export function groupOptions(db) {
  const out = [];
  const walk = (parent) => db.acc.groups.filter((g) => (g.parent || null) === parent).forEach((g) => { out.push(g); walk(g.id); });
  walk(null);
  return out;
}

export function LedgerForm({ ledger, onClose, onSaved, group }) {
  const { db, update, toast, guard } = useStore();
  const editing = !!ledger?.id;
  const [f, setF] = useState(ledger ? { ...ledger, open: Math.abs(ledger.opening || 0), side: (ledger.opening || 0) < 0 ? 'cr' : 'dr' } : { name: '', group: group || 'iexp', open: '', side: 'dr', gstin: '', phone: '', address: '' });
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = () => {
    const name = f.name.trim();
    if (!name) return setErr('Enter a ledger name.');
    if (ledgerList(db).some((l) => l.name.toLowerCase() === name.toLowerCase() && l.id !== f.id)) return setErr('A ledger with this name already exists.');
    if (!editing && !guard('acc_ledger')) return;
    const opening = (Number(f.open) || 0) * (f.side === 'cr' ? -1 : 1);
    const id = f.id || uid('l');
    update((d) => {
      const rec = { id, name, group: f.group, opening, gstin: f.gstin?.trim() || '', phone: f.phone || '', address: f.address || '' };
      const i = d.acc.ledgers.findIndex((l) => l.id === id);
      if (i >= 0) d.acc.ledgers[i] = { ...d.acc.ledgers[i], ...rec }; else d.acc.ledgers.push(rec);
    }, [editing ? 'Edited ledger' : 'Created ledger', 'Ledger', `${name} · under ${db.acc.groups.find((g) => g.id === f.group)?.name}`], editing ? null : 'acc_ledger');
    toast('Ledger saved'); onSaved?.(id); onClose();
  };
  return (
    <Modal title={editing ? 'Alter ledger' : 'Create ledger'} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save}>Save</button></>}>
      <div className="grid g2">
        <div style={{ gridColumn: '1 / -1' }}><Field label="Name"><input className="input" autoFocus value={f.name} onChange={set('name')} /></Field></div>
        <div style={{ gridColumn: '1 / -1' }}><Field label="Under (group)"><select className="input" value={f.group} onChange={set('group')}>{groupOptions(db).map((g) => <option key={g.id} value={g.id}>{indent(db, g)}</option>)}</select></Field></div>
        {['A', 'L'].includes(groupNature(db, f.group)) && (
          <>
            <Field label="Opening balance (₹)"><input className="input num" inputMode="decimal" value={f.open} onChange={(e) => setF({ ...f, open: e.target.value.replace(/[^\d.]/g, '') })} /></Field>
            <Field label="Dr / Cr"><select className="input" value={f.side} onChange={set('side')}><option value="dr">Debit (Dr)</option><option value="cr">Credit (Cr)</option></select></Field>
          </>
        )}
        {['debtors', 'creditors'].some((g) => groupIds(db, g).has(f.group)) && <Field label="GSTIN"><input className="input" value={f.gstin || ''} onChange={set('gstin')} /></Field>}
        <Field label="Phone"><input className="input" value={f.phone || ''} onChange={set('phone')} /></Field>
      </div>
      {err && <div className="alert bad mt"><Icon name="x" />{err}</div>}
    </Modal>
  );
}

export function GroupForm({ onClose }) {
  const { db, update, toast, guard } = useStore();
  const [name, setName] = useState('');
  const [parent, setParent] = useState('iexp');
  const save = () => {
    if (!name.trim()) return;
    if (db.acc.groups.some((g) => g.name.toLowerCase() === name.trim().toLowerCase())) return toast('A group with this name already exists', 'bad');
    if (!guard('acc_group')) return;
    const p = db.acc.groups.find((g) => g.id === parent);
    update((d) => { d.acc.groups.push({ id: uid('g'), name: name.trim(), parent, nature: p.nature, trading: p.trading }); }, ['Created account group', 'Group', `${name} under ${p.name}`], 'acc_group');
    toast('Group created'); onClose();
  };
  return (
    <Modal title="Create group" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save}>Save</button></>}>
      <div className="grid">
        <Field label="Group name"><input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Under" hint="The new group takes the nature (asset, liability, income, expense) of its parent"><select className="input" value={parent} onChange={(e) => setParent(e.target.value)}>{groupOptions(db).map((g) => <option key={g.id} value={g.id}>{indent(db, g)}</option>)}</select></Field>
      </div>
    </Modal>
  );
}
export { money };
