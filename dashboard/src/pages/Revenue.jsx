import { useEffect, useState } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { computeStatus, diffDays, fmtDate, fmtMoney } from '../utils.js';

const KIND_LABELS = { advance: 'Advance', payment: 'Payment', renewal: 'Subscription renewal', adjustment: 'Adjustment' };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// What a client still owes right now: a normal client's remaining balance, or
// one plan amount for a subscription that's due, overdue, or paused past due.
function pendingFor(kind, c, lead){
  if (kind === 'normal') return c.remainingPayment || 0;
  const s = computeStatus(c, lead);
  if (s === 'due' || s === 'overdue') return c.amount;
  if (s === 'paused' && diffDays(c.nextDue, new Date()) < 0) return c.amount;
  return 0;
}

export default function Revenue(){
  const { call, clients, normalClients, settings, showToast, setSelectedClientId, setSelectedNormalClientId } = useApp();
  const [payments, setPayments] = useState(null);
  const [year, setYear] = useState('all');
  const [type, setType] = useState('all');
  const [client, setClient] = useState('all');

  useEffect(() => {
    call('listPayments')
      .then((d) => setPayments((d.payments || []).map((p) => ({ ...p, at: new Date(p.paidAt.replace(' ', 'T')) }))))
      .catch((err) => { setPayments([]); showToast('Could not load revenue: ' + err.message); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (payments === null) return <section><div className="page-head"><div><h1>Revenue</h1><div className="page-sub">Loading…</div></div></div></section>;

  const now = new Date();
  const years = [...new Set(payments.map((p) => p.at.getFullYear()))].sort((a, b) => b - a);
  const projectOptions = [...new Map(payments.map((p) => [p.clientId, p.client])).entries()]
    .concat(clients.map((c) => [c.id, c.client]), normalClients.map((c) => [c.id, c.client]))
    .filter(([id], i, arr) => arr.findIndex(([x]) => x === id) === i)
    .sort((a, b) => a[1].localeCompare(b[1]));

  const byTypeClient = (p) => (type === 'all' || p.clientType === type) && (client === 'all' || p.clientId === client);
  const scoped = payments.filter(byTypeClient);
  const filtered = scoped.filter((p) => year === 'all' || p.at.getFullYear() === Number(year));
  const sum = (list) => list.reduce((t, p) => t + p.amount, 0);

  const live = [
    ...clients.map((c) => ({ kind: 'subscription', c })),
    ...normalClients.map((c) => ({ kind: 'normal', c })),
  ].filter((r) => (type === 'all' || r.kind === type) && (client === 'all' || r.c.id === client));
  const pendingTotal = live.reduce((t, r) => t + pendingFor(r.kind, r.c, settings.lead), 0);

  const thisMonth = sum(scoped.filter((p) => p.at.getFullYear() === now.getFullYear() && p.at.getMonth() === now.getMonth()));
  const thisYear = sum(scoped.filter((p) => p.at.getFullYear() === now.getFullYear()));

  // Month-wise: the 12 months of the chosen year, or the last 12 months.
  const months = [];
  for (let i = 11; i >= 0; i--){
    const d = year === 'all' ? new Date(now.getFullYear(), now.getMonth() - i, 1) : new Date(Number(year), 11 - i, 1);
    const inMonth = scoped.filter((p) => p.at.getFullYear() === d.getFullYear() && p.at.getMonth() === d.getMonth());
    months.push({ label: MONTHS[d.getMonth()] + (year === 'all' ? ' ' + String(d.getFullYear()).slice(2) : ''), total: sum(inMonth), count: inMonth.length });
  }
  const maxMonth = Math.max(1, ...months.map((m) => m.total));

  const yearRows = years.map((y) => {
    const list = scoped.filter((p) => p.at.getFullYear() === y);
    return { y, total: sum(list), count: list.length };
  });

  const projects = new Map();
  filtered.forEach((p) => {
    const key = p.clientId + (p.clientDeleted ? ':deleted' : '');
    const row = projects.get(key) || { key, id: p.clientId, name: p.client, deleted: p.clientDeleted, type: p.clientType, received: 0, last: p.at };
    row.received += p.amount;
    if (p.at > row.last) row.last = p.at;
    projects.set(key, row);
  });
  live.forEach(({ kind, c }) => {
    const pending = pendingFor(kind, c, settings.lead);
    const row = projects.get(c.id) || { key: c.id, id: c.id, name: c.client, deleted: false, type: kind, received: 0, last: null };
    row.pending = pending;
    row.kind = kind;
    row.name = c.client;
    projects.set(c.id, row);
  });
  const projectRows = [...projects.values()].filter((r) => r.received || r.pending).sort((a, b) => b.received - a.received);

  const openClient = (r) => {
    if (r.deleted || !r.kind) return;
    if (r.kind === 'normal') setSelectedNormalClientId(r.id); else setSelectedClientId(r.id);
  };

  const tiles = [
    { label: 'Total earned', value: fmtMoney(Math.round(sum(filtered))), note: (year === 'all' ? 'all time' : year) + ' · ' + filtered.length + ' payment' + (filtered.length === 1 ? '' : 's') },
    { label: 'This month', value: fmtMoney(Math.round(thisMonth)), note: MONTHS[now.getMonth()] + ' ' + now.getFullYear() },
    { label: 'This year', value: fmtMoney(Math.round(thisYear)), note: String(now.getFullYear()) },
    { label: 'Pending amount', value: fmtMoney(Math.round(pendingTotal)), note: 'still to be collected', tone: pendingTotal ? 'tone-warn' : '' },
  ];

  return (
    <section>
      <div className="page-head"><div>
        <h1>Revenue</h1>
        <div className="page-sub">Money received from clients, by month, year and project — plus what's still pending.</div>
      </div></div>

      <div className="toolbar" style={{marginBottom:'16px'}}>
        <select value={year} onChange={(e) => setYear(e.target.value)} aria-label="Year">
          <option value="all">All years</option>
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <select value={type} onChange={(e) => setType(e.target.value)} aria-label="Client type">
          <option value="all">All client types</option>
          <option value="subscription">Subscription</option>
          <option value="normal">Normal</option>
        </select>
        <select value={client} onChange={(e) => setClient(e.target.value)} aria-label="Client" style={{minWidth:'200px'}}>
          <option value="all">All clients / projects</option>
          {projectOptions.map(([id, name]) => <option key={id} value={id}>{name} ({id})</option>)}
        </select>
        {(year !== 'all' || type !== 'all' || client !== 'all') && (
          <button className="btn btn-ghost btn-sm" type="button" onClick={() => { setYear('all'); setType('all'); setClient('all'); }}>Clear filters</button>
        )}
      </div>

      <div className="stat-grid">
        {tiles.map((t) => (
          <div className={'card stat-tile ' + (t.tone || '')} key={t.label}>
            <div className="stat-label">{t.label}</div>
            <div className="stat-value tabular">{t.value}</div>
            <div className="stat-note">{t.note}</div>
          </div>
        ))}
      </div>

      <div className="ov-card" style={{marginBottom:'16px'}}>
        <div className="ov-head"><div className="ov-title">Month-wise earnings {year === 'all' ? '(last 12 months)' : '(' + year + ')'}</div></div>
        <div className="rev-chart" role="img" aria-label="Earnings per month">
          {months.map((m) => (
            <div className="rev-col" key={m.label} title={`${m.label}: ${fmtMoney(Math.round(m.total))} from ${m.count} payment${m.count === 1 ? '' : 's'}`}>
              <div className="rev-val tabular">{m.total ? fmtMoney(Math.round(m.total)) : ''}</div>
              <div className="rev-bar-track"><div className="rev-bar" style={{height: (m.total / maxMonth * 100) + '%'}} /></div>
              <div className="rev-label">{m.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="ov-grid">
        <div className="ov-card tone-good">
          <div className="ov-head"><div className="ov-title">Year-wise earnings</div></div>
          {yearRows.length === 0 && <div className="ov-empty">No payments recorded yet.</div>}
          {yearRows.map((r) => (
            <button type="button" className="ov-row" key={r.y} onClick={() => setYear(String(r.y))}>
              <div className="ov-row-main"><div className="ov-row-name">{r.y}</div><div className="ov-row-sub">{r.count} payment{r.count === 1 ? '' : 's'} · click to view this year</div></div>
              <div className="ov-row-side tabular" style={{fontWeight:700}}>{fmtMoney(Math.round(r.total))}</div>
            </button>
          ))}
        </div>

        <div className="ov-card tone-warn">
          <div className="ov-head"><div className="ov-title">Recent payments</div></div>
          {filtered.length === 0 && <div className="ov-empty">No payments match these filters.</div>}
          {filtered.slice(0, 8).map((p) => (
            <div className="ov-row" key={p.id} style={{cursor:'default'}}>
              <div className="ov-row-main"><div className="ov-row-name">{p.client}</div><div className="ov-row-sub">{KIND_LABELS[p.kind] || p.kind} · {fmtDate(p.at)}</div></div>
              <div className="ov-row-side tabular" style={{fontWeight:700, color: p.amount < 0 ? 'var(--crit)' : 'var(--ink)'}}>{fmtMoney(Math.round(p.amount))}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="section-title"><h2>Project-wise</h2></div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>S.No.</th><th>Client / project</th><th>Type</th><th>Received</th><th>Pending</th><th>Last payment</th></tr></thead>
          <tbody>
            {projectRows.length === 0 && <tr><td colSpan="6" className="empty">Nothing to show for these filters.</td></tr>}
            {projectRows.map((r, i) => (
              <tr key={r.key} onClick={() => openClient(r)} style={{cursor: r.deleted || !r.kind ? 'default' : 'pointer'}}>
                <td className="tabular" style={{color:'var(--ink-muted)'}}>{i + 1}</td>
                <td><div className="cell-name">{r.name}</div><div className="cell-sub">{r.id}{r.deleted ? ' · deleted' : ''}</div></td>
                <td>{(r.kind || r.type) === 'subscription' ? 'Subscription' : 'Normal'}</td>
                <td className="tabular" style={{fontWeight:700}}>{fmtMoney(Math.round(r.received))}</td>
                <td className="tabular" style={{color: r.pending ? 'var(--warn)' : 'var(--ink-faint)'}}>{r.pending ? fmtMoney(Math.round(r.pending)) : '—'}</td>
                <td className="tabular">{r.last ? fmtDate(r.last) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
