import { useState } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { computeStatus, fmtDate, fmtMoney } from '../utils.js';
import StatusPill from '../components/StatusPill.jsx';

export default function Clients(){
  const { clients, normalClients, settings, setAddClientOpen, setSelectedClientId, setSelectedNormalClientId } = useApp();
  const [tab, setTab] = useState('subscription');
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');

  const rows = clients.filter((c) => {
    const s = computeStatus(c, settings.lead);
    const ql = q.toLowerCase();
    const matchQ = !ql || c.client.toLowerCase().includes(ql) || c.software.toLowerCase().includes(ql);
    const matchF = filter === 'all' || filter === s;
    return matchQ && matchF;
  });

  const normalRows = normalClients.filter((c) => {
    const ql = q.toLowerCase();
    return !ql || c.client.toLowerCase().includes(ql) || (c.contact || '').toLowerCase().includes(ql);
  });

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>Clients</h1>
          <div className="page-sub">Every client DTA works with — subscription software deployments and normal clients, managed separately.</div>
        </div>
        <button className="btn btn-primary" data-open-add onClick={() => setAddClientOpen(true)}>
          <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 4v12M4 10h12"/></svg>
          New client
        </button>
      </div>

      <div style={{display:'flex', gap:'8px', marginBottom:'14px'}}>
        <button type="button" className={'btn btn-sm ' + (tab === 'subscription' ? 'btn-primary' : 'btn-secondary')} onClick={() => setTab('subscription')}>Subscription clients</button>
        <button type="button" className={'btn btn-sm ' + (tab === 'normal' ? 'btn-primary' : 'btn-secondary')} onClick={() => setTab('normal')}>Normal clients</button>
      </div>

      {tab === 'subscription' && (
        <>
          <div className="toolbar" style={{marginBottom:'14px'}}>
            <div className="search">
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="8.5" cy="8.5" r="5.3"/><path d="m16 16-3.2-3.2"/></svg>
              <input type="text" placeholder="Search clients or software…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <select value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="due">Due soon</option>
              <option value="overdue">Overdue</option>
              <option value="paused">Paused</option>
            </select>
          </div>

          <div className="table-wrap">
            <table><thead><tr><th>Client</th><th>Plan</th><th>Next due</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {rows.length === 0 && <tr><td colSpan="5" className="empty">No clients match this search.</td></tr>}
                {rows.map((c) => {
                  const s = computeStatus(c, settings.lead);
                  return (
                    <tr key={c.id}>
                      <td><div className="cell-name">{c.client}</div><div className="cell-sub">{c.software}</div></td>
                      <td className="tabular">{fmtMoney(c.amount)} <span style={{color:'var(--ink-faint)'}}>/ {c.cycle === 'Monthly' ? 'mo' : 'yr'}</span></td>
                      <td className="tabular">{fmtDate(c.nextDue)}</td>
                      <td><StatusPill status={s} /></td>
                      <td className="row-actions"><button className="btn btn-secondary btn-sm" data-view-client={c.id} onClick={() => setSelectedClientId(c.id)}>View</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'normal' && (
        <>
          <div className="toolbar" style={{marginBottom:'14px'}}>
            <div className="search">
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="8.5" cy="8.5" r="5.3"/><path d="m16 16-3.2-3.2"/></svg>
              <input type="text" placeholder="Search clients or contact…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
          </div>

          <div className="table-wrap">
            <table><thead><tr><th>Client</th><th>Contact</th><th>Total</th><th>Advance</th><th>Remaining</th><th></th></tr></thead>
              <tbody>
                {normalRows.length === 0 && <tr><td colSpan="6" className="empty">No normal clients match this search.</td></tr>}
                {normalRows.map((c) => (
                  <tr key={c.id}>
                    <td><div className="cell-name">{c.client}</div><div className="cell-sub">{c.address}</div></td>
                    <td>{c.contact || '—'}</td>
                    <td className="tabular">{fmtMoney(c.totalAmount)}</td>
                    <td className="tabular">{fmtMoney(c.advancePayment)}</td>
                    <td className="tabular">{fmtMoney(c.remainingPayment)}</td>
                    <td className="row-actions"><button className="btn btn-secondary btn-sm" onClick={() => setSelectedNormalClientId(c.id)}>View</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
