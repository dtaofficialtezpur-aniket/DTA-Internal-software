import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../lib/store.jsx';
import { CHART_TYPES, computeDataset, computeMetric, DATASETS, DEFAULT_DASHBOARDS, formatFull, isMetricType, METRICS, PERIODS, SIZES } from '../lib/analytics.js';
import { downloadCsv, uid } from '../lib/format.js';
import { Bullet, BarList, Columns, DataTable, Donut, Funnel, Gauge, Kpi, LineChart, Nothing } from '../components/charts.jsx';
import { DemoLeft, Field, Icon, Modal } from '../components/ui.jsx';
import { GROUP_COLORS, GROUP_ICON, ICON_TINT, tint } from '../lib/iconColors.js';

const pref = 'stc-analytics-dash';

// One component's body, picked by type. Always live from the current data.
function Body({ comp, data }) {
  if (!data) return <Nothing />;
  switch (comp.type) {
    case 'kpi': return <Kpi data={data} />;
    case 'gauge': return <Gauge data={data} target={comp.target} />;
    case 'bullet': return <Bullet data={data} target={comp.target} />;
    case 'bar': return <BarList rows={data.rows} fmt={data.fmt} />;
    case 'column': return <Columns rows={data.rows} fmt={data.fmt} />;
    case 'line': return <LineChart rows={data.rows} fmt={data.fmt} />;
    case 'donut': return <Donut rows={data.rows} fmt={data.fmt} />;
    case 'funnel': return <Funnel rows={data.rows} fmt={data.fmt} />;
    default: return <DataTable rows={data.rows} fmt={data.fmt} />;
  }
}

const compute = (db, comp) => {
  try { return isMetricType(comp.type) ? computeMetric(db, comp.source, comp.period) : computeDataset(db, comp.source, comp.period); } catch { return null; }
};

export default function Analytics() {
  const { db, user, update, toast, guard } = useStore();
  const store = db.analytics || { dashboards: DEFAULT_DASHBOARDS, defaultId: 'org' };
  const dashboards = store.dashboards;
  const [id, setId] = useState(() => { try { return localStorage.getItem(pref); } catch { return null; } });
  const dash = dashboards.find((d) => d.id === id) || dashboards.find((d) => d.id === store.defaultId) || dashboards[0];
  const [tick, setTick] = useState(0);
  const [spin, setSpin] = useState(false);
  const [updated, setUpdated] = useState(new Date());
  const [dialog, setDialog] = useState(null);
  const [menu, setMenu] = useState(null);
  const canEdit = ['owner', 'sales_manager'].includes(user.role);
  useEffect(() => { try { localStorage.setItem(pref, dash.id); } catch { /* ignore */ } }, [dash.id]);

  // Writes always start from a stored copy, so the built-in dashboards become editable on first change.
  const mutate = (fn, audit, kind) => update((d) => {
    d.analytics ||= { dashboards: structuredClone(DEFAULT_DASHBOARDS), defaultId: 'org' };
    return fn(d.analytics);
  }, audit, kind);
  const mutateDash = (fn, audit, kind) => mutate((a) => fn(a.dashboards.find((x) => x.id === dash.id), a), audit, kind);

  const refresh = () => { setSpin(true); setTick((t) => t + 1); setUpdated(new Date()); setTimeout(() => setSpin(false), 700); };
  const results = useMemo(() => Object.fromEntries(dash.comps.map((c) => [c.id, compute(db, c)])), [db, dash, tick]); // eslint-disable-line react-hooks/exhaustive-deps

  const move = (cid, dir) => mutateDash((d) => { const i = d.comps.findIndex((c) => c.id === cid); const j = i + dir; if (j < 0 || j >= d.comps.length) return; [d.comps[i], d.comps[j]] = [d.comps[j], d.comps[i]]; }, ['Rearranged dashboard', 'Analytics', dash.name]);
  const remove = (c) => { if (confirm(`Remove "${c.title}" from this dashboard?`)) mutateDash((d) => { d.comps = d.comps.filter((x) => x.id !== c.id); }, ['Removed component', 'Analytics', `${dash.name} · ${c.title}`]); };
  const exportAll = () => downloadCsv(`${dash.name}.csv`, [['Component', 'Item', 'Value'], ...dash.comps.flatMap((c) => {
    const r = results[c.id]; if (!r) return [];
    return r.rows ? r.rows.map((x) => [c.title, x.label, x.value]) : [[c.title, 'Value', r.value], ...(c.target ? [[c.title, 'Target', c.target]] : [])];
  })]);

  return (
    <div className="page analytics">
      <div className="crm-head">
        <div className="row" style={{ gap: 8 }}>
          <div className="dash-select">
            <Icon name="chart" />
            <select value={dash.id} onChange={(e) => setId(e.target.value)} aria-label="Dashboard">
              {dashboards.map((d) => <option key={d.id} value={d.id}>{d.name}{d.id === store.defaultId ? '  ★' : ''}</option>)}
            </select>
          </div>
          <span className="small muted">Updated {updated.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
        <div className="actions">
          <button className="btn icon-btn" onClick={refresh} title="Refresh data" aria-label="Refresh"><Icon name="refresh" className={spin ? 'spin' : ''} /></button>
          {canEdit && <>
            <DemoLeft kind="dash_component" />
            <button className="btn" onClick={() => setDialog({ kind: 'component', comp: null })}><Icon name="plus" />Add Component</button>
            <DemoLeft kind="dash_dashboard" />
            <button className="btn primary" onClick={() => setDialog({ kind: 'dashboard' })}>Create Dashboard</button>
            <div style={{ position: 'relative' }}>
              <button className="btn icon-btn" onClick={() => setMenu(menu === 'dash' ? null : 'dash')} aria-label="Dashboard options"><Icon name="more" /></button>
              {menu === 'dash' && <Menu right onClose={() => setMenu(null)} items={[
                ['edit', 'Rename dashboard', () => setDialog({ kind: 'rename' })],
                ['check', 'Set as default', () => { mutate((a) => { a.defaultId = dash.id; }, ['Set default dashboard', 'Analytics', dash.name]); toast('Default dashboard set'); }],
                ['download', 'Export data (CSV)', exportAll],
                ...(dashboards.length > 1 ? [['trash', 'Delete dashboard', () => { if (confirm(`Delete dashboard "${dash.name}"?`)) { mutate((a) => { a.dashboards = a.dashboards.filter((x) => x.id !== dash.id); if (a.defaultId === dash.id) a.defaultId = a.dashboards[0].id; }, ['Deleted dashboard', 'Analytics', dash.name]); setId(null); } }, 'danger']] : []),
              ]} />}
            </div>
          </>}
          {!canEdit && <button className="btn" onClick={exportAll}><Icon name="download" />Export</button>}
        </div>
      </div>

      <div className="an-grid" key={dash.id + tick}>
        {dash.comps.map((c, i) => (
          <section key={c.id} className={`card an-card ${c.w >= 7 ? 'an-big' : ''}`} style={{ '--w': c.w, animationDelay: `${i * 50}ms` }}>
            <header className="an-head">
              <h3 className="an-title"><GroupBadge comp={c} />{c.title}</h3>
              <div className="an-tools">
                <span className="an-period">{PERIODS.find(([k]) => k === c.period)?.[1]}</span>
                <div style={{ position: 'relative' }}>
                  <button className="btn ghost icon-btn sm" onClick={() => setMenu(menu === c.id ? null : c.id)} aria-label={`Options for ${c.title}`}><Icon name="more" /></button>
                  {menu === c.id && <Menu right onClose={() => setMenu(null)} items={[
                    ['table', 'View data', () => setDialog({ kind: 'data', comp: c })],
                    ...(canEdit ? [
                      ['edit', 'Edit component', () => setDialog({ kind: 'component', comp: c })],
                      ['chevronLeft', 'Move earlier', () => move(c.id, -1)],
                      ['chevronRight', 'Move later', () => move(c.id, 1)],
                      ['trash', 'Remove', () => remove(c), 'danger'],
                    ] : []),
                  ]} />}
                </div>
              </div>
            </header>
            <div className="an-body"><Body comp={c} data={results[c.id]} /></div>
          </section>
        ))}
        {!dash.comps.length && <div className="card an-card" style={{ '--w': 12 }}><div className="an-empty" style={{ padding: 50 }}><Icon name="chart" />This dashboard is empty.{canEdit && <button className="btn primary" style={{ marginTop: 10 }} onClick={() => setDialog({ kind: 'component', comp: null })}>Add Component</button>}</div></div>}
      </div>

      {dialog?.kind === 'component' && <ComponentDialog comp={dialog.comp} onClose={() => setDialog(null)} onSave={(c) => {
        const adding = !dialog.comp;
        if (adding && !guard('dash_component')) return;
        mutateDash((d) => { if (adding) d.comps.push({ ...c, id: uid('cmp') }); else Object.assign(d.comps.find((x) => x.id === dialog.comp.id), c); }, [adding ? 'Added component' : 'Edited component', 'Analytics', `${dash.name} · ${c.title}`], adding ? 'dash_component' : null);
        toast(adding ? 'Component added' : 'Component saved'); setDialog(null);
      }} />}
      {dialog?.kind === 'dashboard' && <NameDialog title="Create Dashboard" label="Dashboard name" start onClose={() => setDialog(null)} onSave={(name, from) => {
        if (!guard('dash_dashboard')) return;
        const nid = uid('dash');
        mutate((a) => { a.dashboards.push({ id: nid, name, comps: from === 'copy' ? structuredClone(dash.comps).map((c) => ({ ...c, id: uid('cmp') })) : [] }); }, ['Created dashboard', 'Analytics', name], 'dash_dashboard');
        setId(nid); toast('Dashboard created'); setDialog(null);
      }} />}
      {dialog?.kind === 'rename' && <NameDialog title="Rename dashboard" label="Dashboard name" initial={dash.name} onClose={() => setDialog(null)} onSave={(name) => { mutateDash((d) => { d.name = name; }, ['Renamed dashboard', 'Analytics', name]); setDialog(null); }} />}
      {dialog?.kind === 'data' && <DataDialog comp={dialog.comp} data={results[dialog.comp.id]} onClose={() => setDialog(null)} />}
    </div>
  );
}

function GroupBadge({ comp }) {
  const g = (isMetricType(comp.type) ? METRICS : DATASETS)[comp.source]?.group;
  return g ? <span className="an-ic" style={tint(GROUP_COLORS[g])}><Icon name={GROUP_ICON[g]} /></span> : null;
}

function Menu({ items, onClose, right }) {
  const ref = useRef();
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    const t = setTimeout(() => document.addEventListener('mousedown', h));
    return () => { clearTimeout(t); document.removeEventListener('mousedown', h); };
  }, [onClose]);
  return (
    <div className={`dropdown ${right ? 'right' : ''}`} ref={ref}>
      {items.map(([icon, label, fn, tone]) => <button key={label} className={tone || ''} onClick={() => { onClose(); fn(); }}><Icon name={icon} style={{ color: ICON_TINT[icon] }} />{label}</button>)}
    </div>
  );
}

function NameDialog({ title, label, initial = '', start, onSave, onClose }) {
  const [name, setName] = useState(initial);
  const [from, setFrom] = useState('blank');
  const save = () => name.trim() && onSave(name.trim(), from);
  return (
    <Modal title={title} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save} disabled={!name.trim()}>Save</button></>}>
      <div className="grid">
        <Field label={label}><input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} /></Field>
        {start && <Field label="Start with"><select className="input" value={from} onChange={(e) => setFrom(e.target.value)}><option value="blank">A blank dashboard</option><option value="copy">A copy of the current dashboard</option></select></Field>}
      </div>
    </Modal>
  );
}

function ComponentDialog({ comp, onSave, onClose }) {
  const { db } = useStore();
  const [f, setF] = useState(comp || { type: 'kpi', title: '', source: 'sales_revenue', w: 3, period: 'this_month', target: '' });
  const metric = isMetricType(f.type);
  const needsTarget = ['gauge', 'bullet'].includes(f.type);
  const catalog = metric ? METRICS : DATASETS;
  const groups = [...new Set(Object.values(catalog).map((x) => x.group))];
  const setType = (type) => {
    const m = isMetricType(type);
    const ok = m ? METRICS[f.source] : DATASETS[f.source];
    const src = ok ? f.source : Object.keys(m ? METRICS : DATASETS)[0];
    const w = { kpi: 3, gauge: 5, bullet: 7, donut: 4, funnel: 6, bar: 6, column: 8, line: 8, table: 6 }[type];
    setF({ ...f, type, source: src, w: comp ? f.w : w, target: ['gauge', 'bullet'].includes(type) ? f.target || '' : '' });
  };
  const sourceLabel = catalog[f.source]?.label || '';
  const save = () => onSave({ ...f, title: (f.title || sourceLabel).toUpperCase(), target: needsTarget ? Number(f.target) || 0 : undefined });
  const preview = { ...f, title: f.title || sourceLabel, target: Number(f.target) || 1 };
  const data = useMemo(() => compute(db, preview), [db, f]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Modal wide title={comp ? 'Edit Component' : 'Add Component'} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save} disabled={needsTarget && !(Number(f.target) > 0)}>{comp ? 'Save' : 'Add to dashboard'}</button></>}>
      <div className="an-dialog">
        <div className="grid">
          <Field label="Chart type"><select className="input" value={f.type} onChange={(e) => setType(e.target.value)}>
            <optgroup label="Single figure">{CHART_TYPES.filter((t) => t[2] === 'metric').map(([k, l]) => <option key={k} value={k}>{l}</option>)}</optgroup>
            <optgroup label="Breakdown">{CHART_TYPES.filter((t) => t[2] === 'dataset').map(([k, l]) => <option key={k} value={k}>{l}</option>)}</optgroup>
          </select></Field>
          <Field label={metric ? 'Measure' : 'Data'}><select className="input" value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })}>
            {groups.map((g) => <optgroup key={g} label={g}>{Object.entries(catalog).filter(([, x]) => x.group === g).map(([k, x]) => <option key={k} value={k}>{x.label}</option>)}</optgroup>)}
          </select></Field>
          <Field label="Title"><input className="input" value={f.title} placeholder={sourceLabel} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
          <div className="grid g2">
            <Field label="Period"><select className="input" value={f.period} onChange={(e) => setF({ ...f, period: e.target.value })}>{PERIODS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
            <Field label="Width"><select className="input" value={f.w} onChange={(e) => setF({ ...f, w: Number(e.target.value) })}>{SIZES.map(([w, l]) => <option key={w} value={w}>{l}</option>)}</select></Field>
          </div>
          {needsTarget && <Field label={`Target (${METRICS[f.source]?.fmt === 'money' ? '₹' : 'number'})`} hint="The gauge and bar show progress towards this figure"><input className="input num" inputMode="decimal" value={f.target} onChange={(e) => setF({ ...f, target: e.target.value.replace(/[^\d.]/g, '') })} /></Field>}
          {['kpi'].includes(f.type) && !METRICS[f.source]?.snapshot && <p className="small muted">Shows the change against the previous equivalent period.</p>}
        </div>
        <div>
          <div className="small muted strong" style={{ marginBottom: 6 }}>PREVIEW</div>
          <section className="card an-card" style={{ '--w': 12 }}>
            <header className="an-head"><h3 className="an-title"><GroupBadge comp={preview} />{(f.title || sourceLabel).toUpperCase()}</h3><span className="an-period">{PERIODS.find(([k]) => k === f.period)?.[1]}</span></header>
            <div className="an-body"><Body comp={preview} data={data} /></div>
          </section>
        </div>
      </div>
    </Modal>
  );
}

function DataDialog({ comp, data, onClose }) {
  return (
    <Modal title={comp.title} onClose={onClose} footer={<button className="btn primary" onClick={onClose}>Close</button>}>
      {!data ? <Nothing /> : data.rows ? <DataTable rows={data.rows} fmt={data.fmt} /> : (
        <table className="t"><tbody>
          <tr><td>{data.label}</td><td className="num strong">{formatFull(data.value, data.fmt)}</td></tr>
          {data.prev != null && <tr><td>Previous period ({data.compare})</td><td className="num">{formatFull(data.prev, data.fmt)}</td></tr>}
          {data.change != null && <tr><td>Change</td><td className="num">{data.change >= 0 ? '+' : ''}{data.change.toFixed(1)}%</td></tr>}
          {comp.target > 0 && <><tr><td>Target</td><td className="num">{formatFull(comp.target, data.fmt)}</td></tr><tr><td>Achieved</td><td className="num">{Math.round(data.value / comp.target * 100)}%</td></tr></>}
        </tbody></table>
      )}
    </Modal>
  );
}
