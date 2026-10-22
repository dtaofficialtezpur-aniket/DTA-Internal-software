import { useState } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { WORK_STATUSES, computeStatus, fmtDate, fmtMoney } from '../utils.js';
import StatusPill, { WorkStatusPill } from '../components/StatusPill.jsx';

const TABS = [
  { key: 'all', label: 'All active clients' },
  { key: 'subscription', label: 'Subscription clients' },
  { key: 'normal', label: 'Normal clients' },
  { key: 'handover', label: 'Handed over' },
];
const SUB_STATUSES = [
  { key: 'active', label: 'Active' }, { key: 'due', label: 'Due soon' },
  { key: 'overdue', label: 'Overdue' }, { key: 'paused', label: 'Paused' },
];
const OPEN_WORK_STATUSES = [
  { key: 'none', label: 'Not set' },
  ...WORK_STATUSES.filter((w) => w.key !== 'handover_done'),
];

const isHandedOver = (r) => r.kind === 'normal' && r.c.workStatus === 'handover_done';
const monthLabel = (d) => d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

export default function Clients({ initialTab }){
  const { clients, normalClients, settings, setAddClientOpen, setSelectedClientId, setSelectedNormalClientId } = useApp();
  const [tab, setTab] = useState(initialTab || 'all');
  const [q, setQ] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const subStatus = (c) => computeStatus(c, settings.lead);
  const all = [
    ...clients.map((c) => ({ kind: 'subscription', c, status: 'sub:' + subStatus(c) })),
    ...normalClients.map((c) => ({ kind: 'normal', c, status: 'work:' + (c.workStatus || 'none') })),
  ];

  // Which clients belong on each tab. "Active" leaves out paused
  // subscriptions and normal clients whose work has been handed over --
  // those finished projects live on their own "Handed over" tab.
  const inTab = {
    all: (r) => !isHandedOver(r) && r.status !== 'sub:paused',
    subscription: (r) => r.kind === 'subscription',
    normal: (r) => r.kind === 'normal' && !isHandedOver(r),
    handover: (r) => isHandedOver(r),
  };
  const counts = Object.fromEntries(TABS.map((t) => [t.key, all.filter(inTab[t.key]).length]));

  const ql = q.trim().toLowerCase();
  const rows = all
    .filter(inTab[tab])
    .filter((r) => tab !== 'all' || typeFilter === 'all' || r.kind === typeFilter)
    .filter((r) => statusFilter === 'all' || r.status === statusFilter)
    .filter((r) => !ql || [r.c.client, r.c.id, r.c.software, r.c.contact, r.c.address, r.c.domain]
      .some((v) => (v || '').toLowerCase().includes(ql)))
    .sort((a, b) => b.c.createdAt - a.c.createdAt);

  // Newest first, with a heading row each time the month changes.
  const body = [];
  let lastMonth = null;
  rows.forEach((r, i) => {
    const m = monthLabel(r.c.createdAt);
    if (m !== lastMonth){
      body.push({ group: m, count: rows.filter((x) => monthLabel(x.c.createdAt) === m).length });
      lastMonth = m;
    }
    body.push({ ...r, serial: i + 1 });
  });

  const showType = tab === 'all';
  const showSubStatuses = tab === 'all' || tab === 'subscription';
  const showWorkStatuses = tab === 'all' || tab === 'normal';
  const columns = 6 + (showType ? 1 : 0);

  function switchTab(key){
    setTab(key); setTypeFilter('all'); setStatusFilter('all');
  }

  function open(r){
    if (r.kind === 'normal') setSelectedNormalClientId(r.c.id);
    else setSelectedClientId(r.c.id);
  }

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>Clients</h1>
          <div className="page-sub">Every client DTA works with — newest first, grouped by the month they were added.</div>
        </div>
        <button className="btn btn-primary" data-open-add onClick={() => setAddClientOpen(true)}>
          <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 4v12M4 10h12"/></svg>
          New client
        </button>
      </div>

      <div style={{display:'flex', gap:'8px', marginBottom:'14px', flexWrap:'wrap'}}>
        {TABS.map((t) => (
          <button key={t.key} type="button" className={'btn btn-sm ' + (tab === t.key ? 'btn-primary' : 'btn-secondary')} onClick={() => switchTab(t.key)}>
            {t.label} <span style={{opacity:.75, marginLeft:'4px'}}>{counts[t.key]}</span>
          </button>
        ))}
      </div>

      <div className="toolbar" style={{marginBottom:'14px'}}>
        <div className="search">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="8.5" cy="8.5" r="5.3"/><path d="m16 16-3.2-3.2"/></svg>
          <input type="text" placeholder="Search name, ID, software, contact or domain…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {showType && (
          <select value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setStatusFilter('all'); }} aria-label="Client type">
            <option value="all">All types</option>
            <option value="subscription">Subscription</option>
            <option value="normal">Normal</option>
          </select>
        )}
        {tab !== 'handover' && (
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Status">
            <option value="all">All statuses</option>
            {showSubStatuses && typeFilter !== 'normal' && (
              <optgroup label="Subscription">
                {SUB_STATUSES.filter((s) => tab === 'subscription' || s.key !== 'paused')
                  .map((s) => <option key={s.key} value={'sub:' + s.key}>{s.label}</option>)}
              </optgroup>
            )}
            {showWorkStatuses && typeFilter !== 'subscription' && (
              <optgroup label="Normal clients">
                {OPEN_WORK_STATUSES.map((w) => <option key={w.key} value={'work:' + w.key}>{w.label}</option>)}
              </optgroup>
            )}
          </select>
        )}
      </div>

      <div className="table-wrap">
        <table>
          <thead><tr>
            <th style={{width:'52px'}}>S.No.</th><th>Client</th>{showType && <th>Type</th>}
            <th>Detail</th><th>Status</th><th>Created on</th><th></th>
          </tr></thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={columns} className="empty">
                {tab === 'handover' ? 'No handed-over projects yet. Set a normal client’s work status to “Handover done” to move it here.' : 'No clients match these filters.'}
              </td></tr>
            )}
            {body.map((r) => r.group ? (
              <tr className="group-row" key={'g-' + r.group}><td colSpan={columns}>{r.group} <span>· {r.count} client{r.count === 1 ? '' : 's'}</span></td></tr>
            ) : (
              <tr key={r.kind + '-' + r.c.id}>
                <td className="tabular" style={{color:'var(--ink-muted)'}}>{r.serial}</td>
                <td>
                  <div className="cell-name">{r.c.client}</div>
                  <div className="cell-sub">{r.c.id} · {r.kind === 'subscription' ? r.c.software : (r.c.contact || r.c.address || '—')}</div>
                </td>
                {showType && <td>{r.kind === 'subscription' ? 'Subscription' : 'Normal'}</td>}
                {r.kind === 'subscription' ? (
                  <td className="tabular">{fmtMoney(r.c.amount)} <span style={{color:'var(--ink-faint)'}}>/ {r.c.cycle === 'Monthly' ? 'mo' : 'yr'}</span>
                    <div className="cell-sub">Next due {fmtDate(r.c.nextDue)}</div></td>
                ) : (
                  <td className="tabular">{fmtMoney(r.c.remainingPayment)} <span style={{color:'var(--ink-faint)'}}>remaining</span>
                    <div className="cell-sub">of {fmtMoney(r.c.totalAmount)} total</div></td>
                )}
                <td>{r.kind === 'subscription' ? <StatusPill status={subStatus(r.c)} /> : <WorkStatusPill status={r.c.workStatus} />}</td>
                <td className="tabular">{fmtDate(r.c.createdAt)}</td>
                <td className="row-actions"><button className="btn btn-secondary btn-sm" data-view-client={r.c.id} onClick={() => open(r)}>View</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
