import { useEffect, useRef, useState } from 'react';
import { useStore } from '../lib/store.jsx';
import { canOpen } from '../lib/calc.js';
import { CRM_KEYS, CRM_MODULES } from '../lib/crmMeta.js';
import { money } from '../lib/format.js';
import { Icon } from './ui.jsx';
import { MODULE_COLORS } from '../lib/iconColors.js';
import { defaultsFor, go, RecordForm } from '../pages/crm/parts.jsx';

function useOutside(ref, onOut) {
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) onOut(); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [ref, onOut]);
}

// "Search records" across CRM modules, customers, invoices and products.
export function GlobalSearch() {
  const { db, user } = useStore();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef();
  useOutside(ref, () => setOpen(false));
  const term = q.trim().toLowerCase();
  const groups = [];
  if (term.length >= 2) {
    for (const k of CRM_KEYS) {
      if (!canOpen(user.role, k)) continue;
      const m = CRM_MODULES[k];
      const hits = db.crm[k].filter((r) => [r[m.title], r.company, r.email, r.phone].some((v) => String(v || '').toLowerCase().includes(term))).slice(0, 4);
      if (hits.length) groups.push([m.label, hits.map((r) => [r[m.title], r[m.subtitle] || r.company || '', `${k}/${r.id}`, m.icon, MODULE_COLORS[k]])]);
    }
    if (canOpen(user.role, 'customers')) {
      const hits = db.customers.filter((c) => c.id !== 'walkin' && (c.name + (c.phone || '')).toLowerCase().includes(term)).slice(0, 4);
      if (hits.length) groups.push(['Billing customers', hits.map((c) => [c.name, c.phone || '', 'customers', 'users', '#d9467a'])]);
    }
    if (canOpen(user.role, 'sales')) {
      const hits = db.invoices.filter((i) => (i.no + i.customerName).toLowerCase().includes(term)).slice(-4).reverse();
      if (hits.length) groups.push(['Invoices', hits.map((i) => [i.no, `${i.customerName} · ${money(i.total)}`, 'sales', 'invoice', '#2e9a52'])]);
    }
    if (canOpen(user.role, 'products')) {
      const hits = db.products.filter((p) => (p.name + p.sku).toLowerCase().includes(term)).slice(0, 4);
      if (hits.length) groups.push(['Products', hits.map((p) => [p.name, p.sku, 'products', 'box', '#c7791a'])]);
    }
  }
  return (
    <div className="gsearch" ref={ref}>
      <Icon name="search" />
      <input className="input sm" placeholder="Search records" value={q} onFocus={() => setOpen(true)} onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onKeyDown={(e) => e.key === 'Escape' && setOpen(false)} aria-label="Search records" />
      {open && term.length >= 2 && (
        <div className="gs-drop">
          {groups.map(([label, items]) => (
            <div key={label}>
              <div className="gs-group">{label}</div>
              {items.map(([title, sub, path, icon, color]) => (
                <button key={path + title} onClick={() => { go(path); setOpen(false); setQ(''); }}><Icon name={icon} style={{ color }} /><span className="grow"><b>{title}</b><span className="muted">{sub}</span></span></button>
              ))}
            </div>
          ))}
          {!groups.length && <div className="small muted" style={{ padding: 14 }}>No records match "{q}".</div>}
        </div>
      )}
    </div>
  );
}

export function QuickCreate() {
  const { user } = useStore();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(null);
  const ref = useRef();
  useOutside(ref, () => setOpen(false));
  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <button className="btn icon-btn quick-btn" onClick={() => setOpen(!open)} title="Create a record" aria-label="Create a record"><Icon name="plus" /></button>
      {open && (
        <div className="dropdown right">
          {CRM_KEYS.filter((k) => canOpen(user.role, k)).map((k) => <button key={k} onClick={() => { setOpen(false); setForm(k); }}><Icon name={CRM_MODULES[k].icon} style={{ color: MODULE_COLORS[k] }} />New {CRM_MODULES[k].singular}</button>)}
        </div>
      )}
      {form && <RecordForm mod={form} record={defaultsFor(form, user)} onClose={() => setForm(null)} onSaved={(r) => go(`${form}/${r.id}`)} />}
    </div>
  );
}
