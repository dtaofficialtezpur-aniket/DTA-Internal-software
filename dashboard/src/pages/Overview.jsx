import { useApp } from '../state/AppContext.jsx';
import { actionColor, computeStatus, diffDays, domainAlerts, domainLabel, fmtDate, fmtMoney, parseDateOnly, timeAgo } from '../utils.js';
import StatusPill from '../components/StatusPill.jsx';

export default function Overview(){
  const { clients, normalClients, settings, setAddClientOpen, setSelectedClientId, setSelectedNormalClientId } = useApp();
  const today = new Date();

  const counts = { active: 0, due: 0, overdue: 0, paused: 0 };
  let mrr = 0;
  let billed = 0;
  clients.forEach((c) => {
    const s = computeStatus(c, settings.lead);
    counts[s]++;
    if (s !== 'paused'){ mrr += c.cycle === 'Annual' ? c.amount / 12 : c.amount; billed++; }
  });

  const owing = normalClients
    .filter((c) => c.remainingPayment > 0)
    .sort((a, b) => b.remainingPayment - a.remainingPayment);
  const outstanding = owing.reduce((sum, c) => sum + c.remainingPayment, 0);

  const domains = domainAlerts(clients, normalClients);
  const domainsExpired = domains.filter((d) => d.days < 0).length;

  const attention = clients
    .filter((c) => ['due', 'overdue'].includes(computeStatus(c, settings.lead)))
    .sort((a, b) => diffDays(a.nextDue, today) - diffDays(b.nextDue, today));

  const recent = [
    ...clients.flatMap((c) => c.history.map((h) => ({ ...h, name: c.client, detail: c.software }))),
    ...normalClients.flatMap((c) => c.history.map((h) => ({ ...h, name: c.client, detail: 'Normal client' }))),
  ].sort((a, b) => b.t - a.t).slice(0, 8);

  const tiles = [
    { label: 'Total clients', value: clients.length + normalClients.length, note: clients.length + ' subscription · ' + normalClients.length + ' normal' },
    { label: 'Active subscriptions', value: counts.active, note: counts.due + ' due soon' },
    { label: 'Payment due / overdue', value: counts.due + counts.overdue, note: counts.overdue + ' overdue', tone: counts.overdue ? 'tone-crit' : '' },
    { label: 'Paused', value: counts.paused, note: 'access currently locked', tone: counts.paused ? 'tone-warn' : '' },
    { label: 'Monthly recurring', value: fmtMoney(Math.round(mrr)), note: 'from ' + billed + ' running plan' + (billed === 1 ? '' : 's') },
    { label: 'Outstanding balance', value: fmtMoney(Math.round(outstanding)), note: owing.length + ' normal client' + (owing.length === 1 ? '' : 's') + ' still owe', tone: owing.length ? 'tone-warn' : '' },
    { label: 'Domains expiring', value: domains.length, note: domainsExpired ? domainsExpired + ' already expired' : 'within 30 days', tone: domainsExpired ? 'tone-crit' : domains.length ? 'tone-warn' : '' },
  ];

  const openClient = (kind, id) => (kind === 'normal' ? setSelectedNormalClientId(id) : setSelectedClientId(id));

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>Overview</h1>
          <div className="page-sub">Every client DTA works with, and what needs attention today.</div>
        </div>
        <button className="btn btn-primary" data-open-add onClick={() => setAddClientOpen(true)}>
          <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 4v12M4 10h12"/></svg>
          Add client
        </button>
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

      <div className="section-title"><h2>Subscription payments</h2></div>
      <div className="table-wrap">
        <table><thead><tr><th>Client</th><th>Software</th><th>Status</th><th>Next due</th><th></th></tr></thead>
          <tbody>
            {attention.length === 0 && <tr><td colSpan="5" className="empty">Nothing needs attention — every subscription is current.</td></tr>}
            {attention.map((c) => {
              const s = computeStatus(c, settings.lead);
              const d = diffDays(c.nextDue, today);
              return (
                <tr key={c.id}>
                  <td className="cell-name">{c.client}</td>
                  <td>{c.software}</td>
                  <td><StatusPill status={s} /></td>
                  <td className="tabular">{fmtDate(c.nextDue)}<div className="cell-sub">{d < 0 ? Math.abs(d) + ' days overdue' : d + ' days left'}</div></td>
                  <td className="row-actions"><button className="btn btn-secondary btn-sm" data-view-client={c.id} onClick={() => setSelectedClientId(c.id)}>View</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {owing.length > 0 && (
        <>
          <div className="section-title"><h2>Pending payments (normal clients)</h2></div>
          <div className="table-wrap">
            <table><thead><tr><th>Client</th><th>Total</th><th>Paid</th><th>Remaining</th><th></th></tr></thead>
              <tbody>
                {owing.slice(0, 8).map((c) => (
                  <tr key={c.id}>
                    <td className="cell-name">{c.client}<div className="cell-sub">{c.contact || c.id}</div></td>
                    <td className="tabular">{fmtMoney(c.totalAmount)}</td>
                    <td className="tabular">{fmtMoney(c.advancePayment)}</td>
                    <td className="tabular" style={{fontWeight:700}}>{fmtMoney(c.remainingPayment)}</td>
                    <td className="row-actions"><button className="btn btn-secondary btn-sm" onClick={() => setSelectedNormalClientId(c.id)}>View</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {owing.length > 8 && <div className="page-sub" style={{marginTop:'6px'}}>Showing the 8 largest of {owing.length} — see the Clients page for the rest.</div>}
        </>
      )}

      {domains.length > 0 && (
        <>
          <div className="section-title"><h2>Domain renewals</h2></div>
          <div className="table-wrap">
            <table><thead><tr><th>Client</th><th>Domain</th><th>Expiry</th><th></th></tr></thead>
              <tbody>
                {domains.map(({ kind, c, days }) => (
                  <tr key={c.id}>
                    <td className="cell-name">{c.client}</td>
                    <td>{c.domain || '—'}</td>
                    <td className="tabular">{fmtDate(parseDateOnly(c.domainExpiry))}
                      <div className="cell-sub" style={{color: days < 0 ? 'var(--crit)' : 'var(--warn)'}}>{domainLabel(days)}</div></td>
                    <td className="row-actions"><button className="btn btn-secondary btn-sm" onClick={() => openClient(kind, c.id)}>View</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div className="section-title"><h2>Recent activity</h2></div>
      <div className="card" style={{padding:'6px 16px'}}>
        <div className="log-list">
          {recent.length === 0 && <div className="empty">No activity yet.</div>}
          {recent.map((e, i) => (
            <div className="log-row" key={i}>
              <div className="log-dot" style={{background: actionColor(e.action)}} />
              <div>
                <div className="log-text"><b>{e.name}</b> — {e.note}</div>
                <div className="log-time">{e.detail} · {timeAgo(e.t)}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
