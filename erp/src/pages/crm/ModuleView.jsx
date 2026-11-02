import { useEffect, useMemo, useRef, useState } from 'react';
import { DEMO_LIMIT, useStore } from '../../lib/store.jsx';
import { applyView, CRM_MODULES, display, fieldOf, groupTotals, localDate, needsValue, opsFor, sortRecords, systemFiltersFor } from '../../lib/crmMeta.js';
import { createRecord, deleteRecords, updateRecord } from '../../lib/crmOps.js';
import { downloadCsv, parseCsv, uid } from '../../lib/format.js';
import { waLink } from '../../lib/calc.js';
import { DemoLeft, Empty, Field, HBar, Icon, Modal } from '../../components/ui.jsx';
import { Avatar, Cell, defaultsFor, FieldInput, go, RecordForm, TONE, useRoute } from './parts.jsx';
import { ICON_TINT, VIEW_COLORS } from '../../lib/iconColors.js';
import RecordDetail from './RecordDetail.jsx';

const PEOPLE = ['leads', 'contacts'];
const VIEW_TYPES = [['table', 'table', 'Table view'], ['kanban', 'kanban', 'Kanban view'], ['cards', 'grid', 'Canvas (cards) view'], ['calendar', 'calendar', 'Calendar view'], ['chart', 'chart', 'Chart view']];

// Per-viewer UI preferences (current view, layout, page size) — a convenience only.
const prefKey = (mod) => `stc-crm-${mod}`;
const loadPref = (mod) => { try { return JSON.parse(localStorage.getItem(prefKey(mod))) || {}; } catch { return {}; } };
const savePref = (mod, p) => { try { localStorage.setItem(prefKey(mod), JSON.stringify(p)); } catch { /* ignore */ } };

export default function ModuleView({ mod }) {
  const [, id] = useRoute();
  if (id) return <RecordDetail mod={mod} id={id} key={id} />;
  return <ListView mod={mod} key={mod} />;
}

function ListView({ mod }) {
  const { db, user, update, toast } = useStore();
  const m = CRM_MODULES[mod];
  const pref = loadPref(mod);
  const custom = db.crm.views[mod] || [];
  const allViews = [{ id: 'all', name: `All ${m.label}` }, ...m.views, ...custom.map((v) => ({ ...v, custom: true }))];
  const [viewId, setViewId] = useState(allViews.some((v) => v.id === pref.viewId) ? pref.viewId : 'all');
  const view = allViews.find((v) => v.id === viewId) || allViews[0];
  const [type, setType] = useState(pref.type || m.defaultView || 'table');
  const [panel, setPanel] = useState(pref.panel ?? true);
  const [fieldFilters, setFieldFilters] = useState([]);
  const [sys, setSys] = useState([]);
  const [sort, setSort] = useState(view.sort || pref.sort || { field: 'createdAt', dir: 'desc' });
  const [search, setSearch] = useState('');
  const [quick, setQuick] = useState('all');
  const [page, setPage] = useState(1);
  const [per, setPer] = useState(pref.per || 10);
  const [sel, setSel] = useState(new Set());
  const [columns, setColumns] = useState(view.columns || pref.columns || m.columns);
  const [groupBy, setGroupBy] = useState(pref.groupBy || m.kanban?.[0]);
  const [chartBy, setChartBy] = useState(m.chart?.[0]);
  const [month, setMonth] = useState(localDate().slice(0, 7));
  const [dialog, setDialog] = useState(null);
  const [menu, setMenu] = useState(null);

  useEffect(() => { savePref(mod, { viewId, type, panel, per, columns, groupBy, sort }); }, [mod, viewId, type, panel, per, columns, groupBy, sort]);
  useEffect(() => { setPage(1); setSel(new Set()); }, [viewId, fieldFilters, sys, search, quick, per]);
  useEffect(() => { if (view.columns) setColumns(view.columns); if (view.sort) setSort(view.sort); }, [viewId]); // eslint-disable-line react-hooks/exhaustive-deps

  const records = useMemo(() => sortRecords(db, mod, applyView(db, mod, db.crm[mod], {
    filters: [...(view.filters || []), ...fieldFilters], sys: [...(view.sys || []), ...sys], search, quick,
  }, user.id), sort), [db, mod, view, fieldFilters, sys, search, quick, sort, user.id]);
  const noted = useMemo(() => new Set(db.crm.notes.filter((n) => n.module === mod).map((n) => n.recordId)), [db, mod]);
  const pages = Math.max(1, Math.ceil(records.length / per));
  const shown = records.slice((page - 1) * per, page * per);
  const selected = records.filter((r) => sel.has(r.id));
  const activeFilters = fieldFilters.length + sys.length;

  const toggle = (rid) => setSel((s) => { const n = new Set(s); n.has(rid) ? n.delete(rid) : n.add(rid); return n; });
  const allOnPage = shown.length > 0 && shown.every((r) => sel.has(r.id));
  const create = (extra = {}) => setDialog({ kind: 'form', record: defaultsFor(mod, user, extra) });
  const remove = (ids) => {
    if (!confirm(`Delete ${ids.length} ${ids.length === 1 ? m.singular.toLowerCase() : m.label.toLowerCase()}? This cannot be undone.`)) return;
    update((d) => deleteRecords(d, mod, ids), ['Deleted records', m.singular, `${ids.length} ${m.label.toLowerCase()}`]);
    setSel(new Set()); toast(`${ids.length} record(s) deleted`);
  };
  const exportCsv = (rows, name) => {
    const fs = m.fields;
    downloadCsv(`${name}.csv`, [fs.map((f) => f.label), ...rows.map((r) => fs.map((f) => display(db, f, r[f.key])))]);
  };
  const clone = (r) => { const { id, createdAt, modifiedAt, touched, converted, convertedTo, ...rest } = r; setDialog({ kind: 'form', record: { ...rest, [m.title]: `${r[m.title]} (copy)` } }); };

  return (
    <div className="page crm-list">
      <div className="crm-head">
        <div className="row" style={{ gap: 8 }}>
          <select className="input view-select" value={viewId} onChange={(e) => setViewId(e.target.value)} aria-label="View">
            <optgroup label="Standard views">{allViews.filter((v) => !v.custom).map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</optgroup>
            {custom.length > 0 && <optgroup label="Custom views">{custom.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</optgroup>}
          </select>
          {view.custom && <button className="btn ghost icon-btn" title="Edit view" onClick={() => setDialog({ kind: 'view', view })}><Icon name="edit" /></button>}
          <button className="btn ghost sm" onClick={() => setDialog({ kind: 'view', view: { name: '', filters: fieldFilters, sys, columns, sort } })}><Icon name="plus" />New view</button>
        </div>
        <div className="actions">
          <DemoLeft kind={'crm_' + mod} />
          <div className="split-btn">
            <button className="btn primary" onClick={() => create()}>Create {m.singular}</button>
            <button className="btn primary caret" onClick={() => setMenu(menu === 'create' ? null : 'create')} aria-label="More create options"><Icon name="chevronDown" /></button>
            {menu === 'create' && <Menu onClose={() => setMenu(null)} items={[
              ['upload', `Import ${m.label}`, () => setDialog({ kind: 'import' })],
              ['download', `Export all ${m.label.toLowerCase()}`, () => exportCsv(db.crm[mod], mod)],
            ]} />}
          </div>
          <div style={{ position: 'relative' }}>
            <button className="btn icon-btn" onClick={() => setMenu(menu === 'more' ? null : 'more')} aria-label="Actions"><Icon name="more" /></button>
            {menu === 'more' && <Menu onClose={() => setMenu(null)} items={[
              ['edit', `Mass update${selected.length ? ` (${selected.length})` : ''}`, () => selected.length ? setDialog({ kind: 'mass' }) : toast('Select records first', 'bad')],
              ['user', 'Change owner', () => selected.length ? setDialog({ kind: 'mass', field: 'ownerId' }) : toast('Select records first', 'bad')],
              ['download', `Export ${selected.length ? 'selected' : 'this view'}`, () => exportCsv(selected.length ? selected : records, `${mod}-${view.name}`)],
              ['columns', 'Manage columns', () => setDialog({ kind: 'columns' })],
              ['trash', `Mass delete${selected.length ? ` (${selected.length})` : ''}`, () => selected.length ? remove([...sel]) : toast('Select records first', 'bad'), 'danger'],
            ]} />}
          </div>
        </div>
      </div>

      <div className="crm-toolbar">
        <button className={`btn sm ${panel ? 'active-tool' : 'ghost'}`} onClick={() => setPanel(!panel)}><Icon name="filter" style={{ color: '#2a78d6' }} />Filter{activeFilters > 0 && <span className="count-pill">{activeFilters}</span>}</button>
        <button className="btn sm ghost" onClick={() => setDialog({ kind: 'sort' })}><Icon name="sort" style={{ color: '#c7791a' }} />Sort{sort.field && <span className="small muted">· {sort.field === 'createdAt' ? 'Created' : sort.field === 'modifiedAt' ? 'Modified' : fieldOf(mod, sort.field)?.label} {sort.dir === 'asc' ? '↑' : '↓'}</span>}</button>
        <span className="tool-sep" />
        <div className="seg">
          {VIEW_TYPES.filter(([k]) => (k !== 'calendar' || m.calendar) && (k !== 'kanban' || m.kanban)).map(([k, icon, label]) => (
            <button key={k} className={type === k ? 'on' : ''} style={{ '--c': VIEW_COLORS[k], color: VIEW_COLORS[k] }} onClick={() => setType(k)} title={label} aria-label={label}><Icon name={icon} /></button>
          ))}
        </div>
        {type === 'table' && <button className="btn sm ghost" onClick={() => setDialog({ kind: 'columns' })}><Icon name="columns" />Columns</button>}
        {type === 'kanban' && <label className="row small" style={{ gap: 6 }}>Group by<select className="input sm" style={{ width: 'auto' }} value={groupBy} onChange={(e) => setGroupBy(e.target.value)}>{m.kanban.map((k) => <option key={k} value={k}>{fieldOf(mod, k).label}</option>)}</select></label>}
        {type === 'chart' && <label className="row small" style={{ gap: 6 }}>Chart by<select className="input sm" style={{ width: 'auto' }} value={chartBy} onChange={(e) => setChartBy(e.target.value)}>{m.chart.map((k) => <option key={k} value={k}>{fieldOf(mod, k).label}</option>)}</select></label>}
        {type === 'calendar' && <MonthNav month={month} setMonth={setMonth} />}
        <div className="grow" />
        <label className="row small" style={{ gap: 6 }}>Filter by
          <select className="input sm" style={{ width: 'auto' }} value={quick} onChange={(e) => setQuick(e.target.value)}>
            <option value="all">All</option><option value="mine">My records</option><option value="touched">Touched</option><option value="untouched">Untouched</option>
          </select>
        </label>
        <div className="search" style={{ width: 220 }}><Icon name="search" /><input className="input sm" placeholder={`Search ${m.label.toLowerCase()}`} value={search} onChange={(e) => setSearch(e.target.value)} /></div>
      </div>

      {selected.length > 0 && (
        <div className="sel-bar">
          <b>{selected.length} selected</b>
          <button className="btn sm" onClick={() => setDialog({ kind: 'mass' })}><Icon name="edit" />Mass update</button>
          <button className="btn sm" onClick={() => setDialog({ kind: 'mass', field: 'ownerId' })}><Icon name="user" />Change owner</button>
          <button className="btn sm" onClick={() => exportCsv(selected, `${mod}-selected`)}><Icon name="download" />Export</button>
          <button className="btn sm danger" onClick={() => remove([...sel])}><Icon name="trash" />Delete</button>
          <button className="btn sm ghost" onClick={() => setSel(new Set())}>Clear selection</button>
        </div>
      )}

      <div className={`crm-body ${panel ? 'with-panel' : ''}`}>
        {panel && <FilterPanel mod={mod} applied={{ fieldFilters, sys }} onApply={(f, s) => { setFieldFilters(f); setSys(s); }} />}
        <div className="card crm-main">
          {type === 'table' && (
            <>
              <div className="table-wrap"><table className="t crm-table">
                <thead><tr>
                  <th style={{ width: 36 }}><input type="checkbox" checked={allOnPage} onChange={() => setSel((s) => { const n = new Set(s); shown.forEach((r) => (allOnPage ? n.delete(r.id) : n.add(r.id))); return n; })} aria-label="Select page" /></th>
                  {columns.map((k) => { const f = fieldOf(mod, k); if (!f) return null; return (
                    <th key={k} className={['currency', 'number', 'percent'].includes(f.type) ? 'num' : ''}>
                      <button className="th-sort" onClick={() => setSort({ field: k, dir: sort.field === k && sort.dir === 'asc' ? 'desc' : 'asc' })}>{f.label}{sort.field === k && <span>{sort.dir === 'asc' ? ' ↑' : ' ↓'}</span>}</button>
                    </th>); })}
                  <th style={{ width: 40 }}><button className="btn ghost icon-btn sm" title="Manage columns" onClick={() => setDialog({ kind: 'columns' })}><Icon name="columns" /></button></th>
                </tr></thead>
                <tbody>{shown.map((r) => (
                  <tr key={r.id} className={`click ${sel.has(r.id) ? 'sel' : ''}`} onClick={() => go(`${mod}/${r.id}`)}>
                    <td onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={sel.has(r.id)} onChange={() => toggle(r.id)} aria-label="Select" /></td>
                    {columns.map((k, i) => { const f = fieldOf(mod, k); if (!f) return null; return (
                      <td key={k} className={['currency', 'number', 'percent'].includes(f.type) ? 'num' : ''}>
                        {i === 0 && k === m.title ? <span className="row" style={{ gap: 10 }}>{noted.has(r.id) && <Icon name="note" className="note-ind" title="Has notes" />}{PEOPLE.includes(mod) && <Avatar name={r[k]} />}<span><b className="rec-link">{r[k]}</b>{m.subtitle && r[m.subtitle] && <span className="small muted" style={{ marginLeft: 8 }}>{r[m.subtitle]}</span>}{r.converted && <span className="badge ok" style={{ marginLeft: 6 }}>Converted</span>}</span></span> : <Cell mod={mod} field={f} rec={r} />}
                      </td>); })}
                    <td onClick={(e) => e.stopPropagation()} style={{ position: 'relative' }}>
                      <button className="btn ghost icon-btn sm row-more" onClick={() => setMenu(menu === r.id ? null : r.id)} aria-label="Record actions"><Icon name="more" /></button>
                      {menu === r.id && <Menu right onClose={() => setMenu(null)} items={[
                        ['edit', 'Edit', () => setDialog({ kind: 'form', record: r })],
                        ['copy', 'Clone', () => clone(r)],
                        ...(!m.activity ? [['check', 'Add task', () => setDialog({ kind: 'activity', mod: 'tasks', relatedTo: { module: mod, id: r.id } })], ['phone', 'Log a call', () => setDialog({ kind: 'activity', mod: 'calls', relatedTo: { module: mod, id: r.id } })]] : []),
                        ...(r.phone ? [['whatsapp', 'WhatsApp', () => window.open(waLink(r.phone, `Namaskar ${r.name || ''}, this is ${db.company.name}, Tezpur.`), '_blank', 'noopener')]] : []),
                        ...(r.email ? [['mail', 'Send email', () => { location.href = `mailto:${r.email}`; }]] : []),
                        ['trash', 'Delete', () => remove([r.id]), 'danger'],
                      ]} />}
                    </td>
                  </tr>
                ))}</tbody>
              </table>{!shown.length && <Empty icon={m.icon} text={`No ${m.label.toLowerCase()} match this view.`} />}</div>
              <div className="crm-foot">
                <span>Total Records <b>{records.length}</b></span>
                <div className="grow" />
                <select className="input sm" style={{ width: 'auto' }} value={per} onChange={(e) => setPer(Number(e.target.value))}>{[10, 20, 50, 100].map((n) => <option key={n} value={n}>{n} records per page</option>)}</select>
                <button className="btn ghost icon-btn sm" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Previous page"><Icon name="chevronLeft" /></button>
                <b className="small">{records.length ? (page - 1) * per + 1 : 0} to {Math.min(page * per, records.length)}</b>
                <button className="btn ghost icon-btn sm" disabled={page >= pages} onClick={() => setPage(page + 1)} aria-label="Next page"><Icon name="chevronRight" /></button>
              </div>
            </>
          )}
          {type === 'kanban' && <Kanban mod={mod} records={records} field={groupBy} />}
          {type === 'cards' && <Cards mod={mod} records={records} />}
          {type === 'calendar' && <Calendar mod={mod} records={records} month={month} onNew={(day) => create({ [m.calendar]: CRM_MODULES[mod].fields.find((f) => f.key === m.calendar).type === 'datetime' ? `${day}T10:00` : day })} />}
          {type === 'chart' && <Chart mod={mod} records={records} field={chartBy} />}
        </div>
      </div>

      {dialog?.kind === 'form' && <RecordForm mod={mod} record={dialog.record} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'activity' && <RecordForm mod={dialog.mod} record={defaultsFor(dialog.mod, user, { relatedTo: dialog.relatedTo })} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'sort' && <SortDialog mod={mod} sort={sort} onApply={(s) => { setSort(s); setDialog(null); }} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'columns' && <ColumnsDialog mod={mod} columns={columns} onApply={(c) => { setColumns(c); setDialog(null); }} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'view' && <ViewDialog mod={mod} view={dialog.view} onSaved={(vid) => { setViewId(vid); setFieldFilters([]); setSys([]); setDialog(null); }} onDeleted={() => { setViewId('all'); setDialog(null); }} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'mass' && <MassUpdate mod={mod} ids={[...sel]} initial={dialog.field} onDone={() => { setSel(new Set()); setDialog(null); }} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'import' && <ImportDialog mod={mod} onClose={() => setDialog(null)} />}
    </div>
  );

  // Kept inside so menus can close each other.
  function Menu({ items, onClose, right }) {
    const ref = useRef();
    useEffect(() => {
      const h = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
      setTimeout(() => document.addEventListener('mousedown', h));
      return () => document.removeEventListener('mousedown', h);
    }, [onClose]);
    return (
      <div className={`dropdown ${right ? 'right' : ''}`} ref={ref}>
        {items.map(([icon, label, fn, tone]) => <button key={label} className={tone || ''} onClick={() => { onClose(); fn(); }}><Icon name={icon} style={{ color: ICON_TINT[icon] }} />{label}</button>)}
      </div>
    );
  }
}

function MonthNav({ month, setMonth }) {
  const shift = (n) => { const [y, mm] = month.split('-').map(Number); const d = new Date(y, mm - 1 + n, 1); setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`); };
  const label = new Date(month + '-01T00:00:00').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  return <div className="row small" style={{ gap: 4 }}><button className="btn ghost icon-btn sm" onClick={() => shift(-1)} aria-label="Previous month"><Icon name="chevronLeft" /></button><b style={{ minWidth: 120, textAlign: 'center' }}>{label}</b><button className="btn ghost icon-btn sm" onClick={() => shift(1)} aria-label="Next month"><Icon name="chevronRight" /></button></div>;
}

function FilterPanel({ mod, applied, onApply }) {
  const m = CRM_MODULES[mod];
  const [q, setQ] = useState('');
  const [open, setOpen] = useState({ sys: true, fields: true });
  const [sys, setSys] = useState(applied.sys);
  const [ff, setFf] = useState(Object.fromEntries(applied.fieldFilters.map((c) => [c.field, c])));
  const match = (label) => label.toLowerCase().includes(q.toLowerCase());
  const setCond = (k, patch) => setFf((x) => ({ ...x, [k]: { ...x[k], ...patch } }));
  const toggleField = (f) => setFf((x) => { const n = { ...x }; if (n[f.key]) delete n[f.key]; else n[f.key] = { field: f.key, op: opsFor(f)[0][0], value: ['select', 'owner', 'lookup'].includes(f.type) ? [] : '' }; return n; });
  const count = sys.length + Object.keys(ff).length;
  return (
    <aside className="card filter-panel">
      <div className="fp-head"><b>Filter {m.label} by</b></div>
      <div className="fp-search search"><Icon name="search" /><input className="input sm" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <div className="fp-scroll">
        <button className="fp-group" onClick={() => setOpen({ ...open, sys: !open.sys })}><Icon name="chevronDown" style={{ transform: open.sys ? 'none' : 'rotate(-90deg)' }} />System Defined Filters</button>
        {open.sys && systemFiltersFor(mod).filter(([, l]) => match(l)).map(([k, label]) => (
          <label key={k} className="fp-item"><input type="checkbox" checked={sys.includes(k)} onChange={() => setSys(sys.includes(k) ? sys.filter((x) => x !== k) : [...sys, k])} />{label}</label>
        ))}
        <button className="fp-group" onClick={() => setOpen({ ...open, fields: !open.fields })}><Icon name="chevronDown" style={{ transform: open.fields ? 'none' : 'rotate(-90deg)' }} />Filter By Fields</button>
        {open.fields && m.fields.filter((f) => match(f.label)).map((f) => (
          <div key={f.key}>
            <label className="fp-item"><input type="checkbox" checked={!!ff[f.key]} onChange={() => toggleField(f)} />{f.label}</label>
            {ff[f.key] && <CondEditor mod={mod} field={f} cond={ff[f.key]} onChange={(p) => setCond(f.key, p)} />}
          </div>
        ))}
      </div>
      <div className="fp-foot">
        <button className="btn sm" onClick={() => { setSys([]); setFf({}); onApply([], []); }}>Clear</button>
        <button className="btn sm primary grow" onClick={() => onApply(Object.values(ff), sys)}>Apply Filter{count ? ` (${count})` : ''}</button>
      </div>
    </aside>
  );
}

function CondEditor({ mod, field, cond, onChange }) {
  const { db } = useStore();
  const multi = ['select', 'owner', 'lookup'].includes(field.type);
  const options = field.type === 'select' ? field.options.map((o) => [o, o])
    : field.type === 'owner' ? [['$me', 'Me (current user)'], ...db.users.map((u) => [u.id, u.name])]
      : field.type === 'lookup' ? db.crm[field.module].map((r) => [r.id, r[CRM_MODULES[field.module].title]]) : [];
  const vals = Array.isArray(cond.value) ? cond.value : [];
  const inputType = ['date', 'datetime'].includes(field.type) ? 'date' : ['currency', 'number', 'percent'].includes(field.type) ? 'number' : 'text';
  return (
    <div className="cond">
      <select className="input sm" value={cond.op} onChange={(e) => onChange({ op: e.target.value })}>{opsFor(field).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      {needsValue(cond.op) && (multi ? (
        <div className="cond-opts">{options.map(([v, l]) => <label key={v} className="small row" style={{ gap: 6 }}><input type="checkbox" checked={vals.includes(v)} onChange={() => onChange({ value: vals.includes(v) ? vals.filter((x) => x !== v) : [...vals, v] })} />{l}</label>)}</div>
      ) : (
        <>
          <input className="input sm" type={inputType} value={cond.value || ''} placeholder="Value" onChange={(e) => onChange({ value: e.target.value })} />
          {cond.op === 'between' && <input className="input sm" type={inputType} value={cond.value2 || ''} placeholder="and" onChange={(e) => onChange({ value2: e.target.value })} />}
        </>
      ))}
    </div>
  );
}

function Kanban({ mod, records, field }) {
  const { db, user, update, toast } = useStore();
  const m = CRM_MODULES[mod];
  const f = fieldOf(mod, field);
  const [over, setOver] = useState(null);
  const cols = [...f.options, ''];
  const drop = (val, rid) => {
    const r = db.crm[mod].find((x) => x.id === rid);
    if (!r || (r[field] || '') === val) return;
    update((d) => updateRecord(d, mod, rid, { [field]: val }, user), [`Moved ${m.singular.toLowerCase()}`, m.singular, `${r[m.title]} → ${val || '-None-'}`]);
    toast(`${r[m.title]} moved to ${val || '-None-'}`);
  };
  return (
    <div className="crm-kanban">
      {cols.map((c) => {
        const items = records.filter((r) => (r[field] || '') === c);
        if (c === '' && !items.length) return null;
        return (
          <div key={c || 'none'} className={`kb-col ${over === c ? 'over' : ''}`} onDragOver={(e) => { e.preventDefault(); setOver(c); }} onDragLeave={() => setOver(null)}
            onDrop={(e) => { e.preventDefault(); setOver(null); drop(c, e.dataTransfer.getData('text/plain')); }}>
            <div className="kb-head"><span className={`badge ${TONE[c] || 'blue'}`}>{c || '-None-'}</span><span className="small muted">{items.length}</span>
              {m.sum && <div className="small strong" style={{ width: '100%', marginTop: 4 }}>₹{groupTotals(items, m.sum).toLocaleString('en-IN')}</div>}</div>
            <div className="kb-list">
              {items.map((r) => (
                <div key={r.id} className="kb-card" draggable onDragStart={(e) => e.dataTransfer.setData('text/plain', r.id)} onClick={() => go(`${mod}/${r.id}`)}>
                  <div className="strong small">{r[m.title]}</div>
                  {m.fields.filter((x) => m.columns.includes(x.key) && x.key !== m.title && x.key !== field).slice(0, 3).map((x) => r[x.key] ? <div key={x.key} className="small muted">{display(db, x, r[x.key])}</div> : null)}
                  <div className="row between" style={{ marginTop: 6 }}><Avatar name={db.users.find((u) => u.id === r.ownerId)?.name} size={22} />{m.sum && <b className="small">₹{Number(r[m.sum] || 0).toLocaleString('en-IN')}</b>}</div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Cards({ mod, records }) {
  const { db } = useStore();
  const m = CRM_MODULES[mod];
  if (!records.length) return <Empty icon={m.icon} text="Nothing to show." />;
  return (
    <div className="crm-cards">
      {records.slice(0, 120).map((r) => (
        <button key={r.id} className="crm-card" onClick={() => go(`${mod}/${r.id}`)}>
          <div className="row" style={{ gap: 10 }}><Avatar name={r[m.title]} size={38} /><div style={{ minWidth: 0 }}><div className="strong">{r[m.title]}</div><div className="small muted">{r[m.subtitle]}</div></div></div>
          <div className="crm-card-fields">
            {m.columns.filter((k) => k !== m.title).slice(0, 4).map((k) => { const f = fieldOf(mod, k); return <div key={k}><span>{f.label}</span><b>{display(db, f, r[k]) || '—'}</b></div>; })}
          </div>
        </button>
      ))}
    </div>
  );
}

function Calendar({ mod, records, month, onNew }) {
  const m = CRM_MODULES[mod];
  const [y, mm] = month.split('-').map(Number);
  const first = new Date(y, mm - 1, 1);
  const start = new Date(first); start.setDate(1 - ((first.getDay() + 6) % 7));
  const days = [...Array(42)].map((_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return localDate(d); });
  const today = localDate();
  return (
    <div className="crm-cal">
      {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <div key={d} className="cal-dow">{d}</div>)}
      {days.map((d) => {
        const items = records.filter((r) => String(r[m.calendar] || '').slice(0, 10) === d);
        return (
          <div key={d} className={`cal-day ${d.slice(0, 7) !== month ? 'out' : ''} ${d === today ? 'today' : ''}`} onDoubleClick={() => onNew(d)} title="Double-click to add">
            <div className="cal-num">{Number(d.slice(8))}</div>
            {items.slice(0, 3).map((r) => <a key={r.id} className={`cal-item ${TONE[r.status || r.stage || r.rating] || ''}`} href={`#/${mod}/${r.id}`}>{r[m.title]}</a>)}
            {items.length > 3 && <div className="small muted">+{items.length - 3} more</div>}
          </div>
        );
      })}
    </div>
  );
}

function Chart({ mod, records, field }) {
  const { db } = useStore();
  const m = CRM_MODULES[mod];
  const f = fieldOf(mod, field);
  const groups = {};
  for (const r of records) { const k = display(db, f, r[field]) || '-None-'; (groups[k] ||= []).push(r); }
  const rows = Object.entries(groups).map(([k, rs]) => [k, rs.length, m.sum ? groupTotals(rs, m.sum) : 0]).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...rows.map((r) => r[1]));
  return (
    <div className="card-body">
      <h3 style={{ marginBottom: 14 }}>{m.label} by {f.label}</h3>
      {rows.map(([k, n, s]) => (
        <div key={k} className="chart-row">
          <span className="small strong" style={{ width: 170 }}>{k}</span>
          <div className="grow"><HBar pct={n / max * 100} tone={TONE[k] === 'bad' ? 'red' : TONE[k] === 'gold' ? 'gold' : ''} /></div>
          <span className="small" style={{ width: 140, textAlign: 'right' }}><b>{n}</b>{m.sum ? ` · ₹${s.toLocaleString('en-IN')}` : ''}</span>
        </div>
      ))}
      {!rows.length && <Empty icon="chart" text="No data." />}
    </div>
  );
}

function SortDialog({ mod, sort, onApply, onClose }) {
  const [s, setS] = useState(sort);
  const m = CRM_MODULES[mod];
  return (
    <Modal title="Sort records" onClose={onClose} footer={<><button className="btn" onClick={() => onApply({ field: 'createdAt', dir: 'desc' })}>Reset</button><div className="grow" /><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={() => onApply(s)}>Apply</button></>}>
      <div className="grid g2">
        <Field label="Sort by"><select className="input" value={s.field} onChange={(e) => setS({ ...s, field: e.target.value })}>
          <option value="createdAt">Created Time</option><option value="modifiedAt">Modified Time</option>
          {m.fields.filter((f) => f.type !== 'textarea').map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
        </select></Field>
        <Field label="Order"><select className="input" value={s.dir} onChange={(e) => setS({ ...s, dir: e.target.value })}><option value="asc">Ascending (A → Z, low → high, old → new)</option><option value="desc">Descending (Z → A, high → low, new → old)</option></select></Field>
      </div>
    </Modal>
  );
}

function ColumnsDialog({ mod, columns, onApply, onClose }) {
  const m = CRM_MODULES[mod];
  const [cols, setCols] = useState(columns.filter((k) => fieldOf(mod, k)));
  const move = (i, d) => { const n = cols.slice(); const [x] = n.splice(i, 1); n.splice(i + d, 0, x); setCols(n); };
  const hidden = m.fields.filter((f) => !cols.includes(f.key));
  return (
    <Modal title="Manage columns" onClose={onClose} footer={<><button className="btn" onClick={() => setCols(m.columns)}>Default</button><div className="grow" /><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={() => onApply(cols)} disabled={!cols.length}>Apply</button></>}>
      <div className="grid g2">
        <div><div className="form-section">Shown columns</div>
          {cols.map((k, i) => (
            <div key={k} className="col-item"><span className="grow">{fieldOf(mod, k).label}</span>
              <button className="btn ghost icon-btn sm" disabled={!i} onClick={() => move(i, -1)} aria-label="Move up">↑</button>
              <button className="btn ghost icon-btn sm" disabled={i === cols.length - 1} onClick={() => move(i, 1)} aria-label="Move down">↓</button>
              <button className="btn ghost icon-btn sm" onClick={() => setCols(cols.filter((x) => x !== k))} aria-label="Hide"><Icon name="x" /></button></div>
          ))}
        </div>
        <div><div className="form-section">Available fields</div>
          {hidden.map((f) => <button key={f.key} className="col-item add" onClick={() => setCols([...cols, f.key])}><Icon name="plus" />{f.label}</button>)}
          {!hidden.length && <p className="small muted">All fields are shown.</p>}
        </div>
      </div>
    </Modal>
  );
}

function ViewDialog({ mod, view, onSaved, onDeleted, onClose }) {
  const { update, toast, guard } = useStore();
  const m = CRM_MODULES[mod];
  const [name, setName] = useState(view.name || '');
  const [conds, setConds] = useState(view.filters || []);
  const [sys, setSys] = useState(view.sys || []);
  const [columns, setColumns] = useState(view.columns || m.columns);
  const [sort, setSort] = useState(view.sort || { field: 'createdAt', dir: 'desc' });
  const add = () => { const f = m.fields[0]; setConds([...conds, { field: f.key, op: opsFor(f)[0][0], value: '' }]); };
  const save = () => {
    if (!name.trim()) return toast('Name the view', 'bad');
    if (!view.id && !guard('crm_views')) return;
    const vid = view.id || uid('vw');
    update((d) => { const list = (d.crm.views[mod] ||= []); const rec = { id: vid, name: name.trim(), filters: conds, sys, columns, sort }; const i = list.findIndex((v) => v.id === vid); if (i >= 0) list[i] = rec; else list.push(rec); },
      [view.id ? 'Edited custom view' : 'Created custom view', 'View', `${m.label} · ${name}`], view.id ? null : 'crm_views');
    toast('View saved'); onSaved(vid);
  };
  const del = () => { update((d) => { d.crm.views[mod] = (d.crm.views[mod] || []).filter((v) => v.id !== view.id); }, ['Deleted custom view', 'View', name]); onDeleted(); };
  return (
    <Modal wide title={view.id ? 'Edit custom view' : 'Create custom view'} onClose={onClose} footer={<>{view.id && <button className="btn danger" onClick={del}><Icon name="trash" />Delete view</button>}<div className="grow" /><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save}>Save view</button></>}>
      <Field label="View name"><input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={`e.g. Hot ${m.label.toLowerCase()} in Tezpur`} /></Field>
      <div className="form-section mt">Criteria (all must match)</div>
      {conds.map((c, i) => { const f = fieldOf(mod, c.field); return (
        <div key={i} className="row wrap" style={{ marginBottom: 8, alignItems: 'flex-start' }}>
          <select className="input sm" style={{ width: 180 }} value={c.field} onChange={(e) => { const nf = fieldOf(mod, e.target.value); setConds(conds.map((x, j) => (j === i ? { field: nf.key, op: opsFor(nf)[0][0], value: ['select', 'owner', 'lookup'].includes(nf.type) ? [] : '' } : x))); }}>
            {m.fields.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
          </select>
          <div className="grow"><CondEditor field={f} cond={c} onChange={(p) => setConds(conds.map((x, j) => (j === i ? { ...x, ...p } : x)))} /></div>
          <button className="btn ghost icon-btn sm" onClick={() => setConds(conds.filter((_, j) => j !== i))} aria-label="Remove criterion"><Icon name="x" /></button>
        </div>); })}
      <button className="btn sm" onClick={add}><Icon name="plus" />Add criterion</button>
      <div className="form-section mt">System filters</div>
      <div className="row wrap">{systemFiltersFor(mod).map(([k, l]) => <label key={k} className="small row" style={{ gap: 6 }}><input type="checkbox" checked={sys.includes(k)} onChange={() => setSys(sys.includes(k) ? sys.filter((x) => x !== k) : [...sys, k])} />{l}</label>)}</div>
      <div className="grid g2 mt">
        <Field label="Sort by"><select className="input" value={sort.field} onChange={(e) => setSort({ ...sort, field: e.target.value })}><option value="createdAt">Created Time</option><option value="modifiedAt">Modified Time</option>{m.fields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}</select></Field>
        <Field label="Order"><select className="input" value={sort.dir} onChange={(e) => setSort({ ...sort, dir: e.target.value })}><option value="asc">Ascending</option><option value="desc">Descending</option></select></Field>
      </div>
      <div className="form-section mt">Columns</div>
      <div className="row wrap">{m.fields.map((f) => <label key={f.key} className="small row" style={{ gap: 6 }}><input type="checkbox" checked={columns.includes(f.key)} onChange={() => setColumns(columns.includes(f.key) ? columns.filter((x) => x !== f.key) : [...columns, f.key])} />{f.label}</label>)}</div>
    </Modal>
  );
}

function MassUpdate({ mod, ids, initial, onDone, onClose }) {
  const { user, update, toast } = useStore();
  const m = CRM_MODULES[mod];
  const editable = m.fields.filter((f) => !['textarea'].includes(f.type) && !f.required);
  const [key, setKey] = useState(initial || editable[0].key);
  const [value, setValue] = useState(initial === 'ownerId' ? user.id : '');
  const f = fieldOf(mod, key);
  const apply = () => {
    const v = ['currency', 'number', 'percent'].includes(f.type) && value !== '' ? Number(value) : value;
    update((d) => { for (const rid of ids) updateRecord(d, mod, rid, { [key]: v }, user); }, ['Mass update', m.singular, `${ids.length} ${m.label.toLowerCase()} · ${f.label}`]);
    toast(`${ids.length} record(s) updated`); onDone();
  };
  return (
    <Modal title={`Mass update — ${ids.length} ${m.label.toLowerCase()}`} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={apply}>Update</button></>}>
      <div className="grid">
        <Field label="Field to update"><select className="input" value={key} onChange={(e) => { setKey(e.target.value); setValue(''); }}>{editable.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}</select></Field>
        <Field label="New value"><FieldInput field={f} value={value} onChange={setValue} /></Field>
      </div>
    </Modal>
  );
}

function ImportDialog({ mod, onClose }) {
  const { user, update, toast, demoLeft } = useStore();
  const m = CRM_MODULES[mod];
  const [rows, setRows] = useState(null);
  const [map, setMap] = useState({});
  const file = useRef();
  const read = async (fl) => {
    const data = parseCsv(await fl.text());
    if (data.length < 2) return toast('The file has no data rows', 'bad');
    const head = data[0];
    setRows(data);
    setMap(Object.fromEntries(head.map((h, i) => [i, m.fields.find((f) => f.label.toLowerCase() === h.toLowerCase() || f.key.toLowerCase() === h.toLowerCase() || h.toLowerCase().includes(f.label.toLowerCase().split(' ')[0]))?.key || ''])));
  };
  const sample = () => downloadCsv(`${mod}-import-template.csv`, [m.fields.filter((f) => !['owner', 'lookup', 'related'].includes(f.type)).map((f) => f.label)]);
  const go2 = () => {
    const body = rows.slice(1);
    const left = demoLeft('crm_' + mod);
    const take = body.slice(0, left);
    if (!take.length) return toast(`Demo limit: no ${m.label.toLowerCase()} left to create in this login`, 'bad');
    update((d) => {
      for (const r of take) {
        const rec = {};
        Object.entries(map).forEach(([i, k]) => { if (!k) return; const f = fieldOf(mod, k); let v = r[i] ?? ''; if (['currency', 'number', 'percent'].includes(f.type)) v = Number(String(v).replace(/[^\d.-]/g, '')) || 0; if (f.type === 'select' && v && !f.options.includes(v)) v = f.options.find((o) => o.toLowerCase() === v.toLowerCase()) || ''; rec[k] = v; });
        if (rec[m.title]) createRecord(d, mod, rec, user);
        d.demoUsage ||= {}; d.demoUsage['crm_' + mod] = (d.demoUsage['crm_' + mod] || 0) + 1;
      }
    }, ['Imported records', m.singular, `${take.length} ${m.label.toLowerCase()}`]);
    toast(take.length < body.length ? `${take.length} of ${body.length} rows imported — the demo allows ${DEMO_LIMIT} ${m.label.toLowerCase()} per login` : `${take.length} ${m.label.toLowerCase()} imported`);
    onClose();
  };
  return (
    <Modal wide title={`Import ${m.label}`} onClose={onClose} footer={<>{rows && <button className="btn" onClick={() => setRows(null)}>Choose another file</button>}<div className="grow" /><button className="btn" onClick={onClose}>Cancel</button>{rows && <button className="btn primary" onClick={go2}>Import {rows.length - 1} row(s)</button>}</>}>
      {!rows ? (
        <div className="grid">
          <div className="card scan-drop" onClick={() => file.current.click()}><Icon name="upload" style={{ width: 36, height: 36 }} /><h3>Choose a CSV file</h3><p className="small muted">Exported from Excel, Tally or another CRM. The first row must contain column names.</p></div>
          <input ref={file} type="file" accept=".csv,text/csv" hidden onChange={(e) => e.target.files[0] && read(e.target.files[0])} />
          <button className="btn sm" style={{ justifySelf: 'start' }} onClick={sample}><Icon name="download" />Download template</button>
        </div>
      ) : (
        <>
          <div className="form-section">Map columns to fields</div>
          <table className="t"><thead><tr><th>Column in file</th><th>Sample value</th><th>CRM field</th></tr></thead>
            <tbody>{rows[0].map((h, i) => (
              <tr key={i}><td className="strong">{h}</td><td className="small muted">{rows[1]?.[i]}</td>
                <td><select className="input sm" value={map[i] || ''} onChange={(e) => setMap({ ...map, [i]: e.target.value })}><option value="">Do not import</option>{m.fields.filter((f) => !['owner', 'lookup', 'related'].includes(f.type)).map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}</select></td></tr>
            ))}</tbody></table>
          {!Object.values(map).includes(m.title) && <div className="alert warn mt"><Icon name="alert" />Map a column to <b>{fieldOf(mod, m.title).label}</b>; rows without it are skipped.</div>}
        </>
      )}
    </Modal>
  );
}
