import { useApp } from '../state/AppContext.jsx';
import { computeStatus, diffDays, fmtDate, fmtMoney } from '../utils.js';
import StatusPill from '../components/StatusPill.jsx';

export default function Overview(){
  const { clients, settings, setAddClientOpen, setSelectedClientId } = useApp();
  const today = new Date();

  const counts = { active: 0, due: 0, overdue: 0, paused: 0 };
  let mrr = 0;
  clients.forEach((c) => {
    counts[computeStatus(c, settings.lead)]++;
    mrr += c.cycle === 'Annual' ? c.amount / 12 : c.amount;
  });
  const tiles = [
    { label: 'Total clients', value: clients.length, note: 'across all DTA builds' },
    { label: 'Active', value: counts.active, note: 'in good standing', tone: '' },
    { label: 'Payment due / overdue', value: counts.due + counts.overdue, note: counts.overdue + ' overdue', tone: 'tone-crit' },
    { label: 'Paused', value: counts.paused, note: 'access currently locked', tone: 'tone-warn' },
  ];

  const attention = clients
    .filter((c) => ['due', 'overdue'].includes(computeStatus(c, settings.lead)))
    .sort((a, b) => diffDays(a.nextDue, today) - diffDays(b.nextDue, today));

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>Overview</h1>
          <div className="page-sub">Every client running DTA-built software, and what needs attention today.</div>
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
        <div className="card stat-tile">
          <div className="stat-label">Est. monthly recurring</div>
          <div className="stat-value tabular">{fmtMoney(Math.round(mrr))}</div>
          <div className="stat-note">from active + due plans</div>
        </div>
      </div>

      <div className="section-title"><h2>Needs attention</h2></div>
      <div className="table-wrap">
        <table><thead><tr><th>Client</th><th>Software</th><th>Status</th><th>Next due</th><th></th></tr></thead>
          <tbody>
            {attention.length === 0 && <tr><td colSpan="5" className="empty">Nothing needs attention — every client is current.</td></tr>}
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
    </section>
  );
}
