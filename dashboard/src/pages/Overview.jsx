import { useApp } from '../state/AppContext.jsx';
import { actionColor, computeStatus, diffDays, domainAlerts, domainLabel, fmtDate, fmtMoney, parseDateOnly, timeAgo } from '../utils.js';
import StatusPill from '../components/StatusPill.jsx';

const LIMIT = 5;

function OvCard({ tone, title, count, button, onButton, children }){
  return (
    <div className={'ov-card tone-' + tone}>
      <div className="ov-head">
        <div className="ov-title">{title}{count !== undefined && <span className="ov-count">{count}</span>}</div>
        <button type="button" className="btn btn-primary btn-sm" onClick={onButton}>{button}</button>
      </div>
      {children}
    </div>
  );
}

function More({ shown, total }){
  return total > shown ? <div className="ov-more">+ {total - shown} more — use the button above to see everything</div> : null;
}

export default function Overview({ onNavigate }){
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
  ].sort((a, b) => b.t - a.t).slice(0, LIMIT);

  const tiles = [
    { label: 'Total clients', value: clients.length + normalClients.length, note: clients.length + ' subscription · ' + normalClients.length + ' normal' },
    { label: 'Active subscriptions', value: counts.active, note: counts.due + ' due soon' },
    { label: 'Payment due / overdue', value: counts.due + counts.overdue, note: counts.overdue + ' overdue', tone: counts.overdue ? 'tone-crit' : '' },
    { label: 'Paused', value: counts.paused, note: 'access currently locked', tone: counts.paused ? 'tone-warn' : '' },
    { label: 'Monthly recurring', value: fmtMoney(Math.round(mrr)), note: 'from ' + billed + ' running plan' + (billed === 1 ? '' : 's') },
    { label: 'Pending balance', value: fmtMoney(Math.round(outstanding)), note: owing.length + ' normal client' + (owing.length === 1 ? '' : 's') + ' still owe', tone: owing.length ? 'tone-warn' : '' },
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

      <div className="ov-grid">
        <OvCard tone="accent" title="Subscription payments" count={attention.length} button="View subscriptions" onButton={() => onNavigate('clients', 'subscription')}>
          {attention.length === 0 && <div className="ov-empty">Every subscription is current.</div>}
          {attention.slice(0, LIMIT).map((c) => {
            const s = computeStatus(c, settings.lead);
            const d = diffDays(c.nextDue, today);
            return (
              <button type="button" className="ov-row" key={c.id} data-view-client={c.id} onClick={() => setSelectedClientId(c.id)}>
                <div className="ov-row-main">
                  <div className="ov-row-name">{c.client}</div>
                  <div className="ov-row-sub">{c.software} · {d < 0 ? Math.abs(d) + ' days overdue' : d + ' days left'}</div>
                </div>
                <div className="ov-row-side"><StatusPill status={s} /></div>
              </button>
            );
          })}
          <More shown={LIMIT} total={attention.length} />
        </OvCard>

        <OvCard tone="warn" title="Pending payments" count={owing.length} button="View normal clients" onButton={() => onNavigate('clients', 'normal')}>
          {owing.length === 0 && <div className="ov-empty">No pending balances.</div>}
          {owing.slice(0, LIMIT).map((c) => (
            <button type="button" className="ov-row" key={c.id} onClick={() => setSelectedNormalClientId(c.id)}>
              <div className="ov-row-main">
                <div className="ov-row-name">{c.client}</div>
                <div className="ov-row-sub">Paid {fmtMoney(c.advancePayment + (c.paidAmount || 0))} of {fmtMoney(c.totalAmount)}</div>
              </div>
              <div className="ov-row-side" style={{fontWeight:700, color:'var(--warn)'}}>{fmtMoney(c.remainingPayment)}</div>
            </button>
          ))}
          <More shown={LIMIT} total={owing.length} />
        </OvCard>
      </div>

      <div className="ov-grid">
        <OvCard tone="crit" title="Domain renewals" count={domains.length} button="View clients" onButton={() => onNavigate('clients', 'all')}>
          {domains.length === 0 && <div className="ov-empty">No domains expiring in the next 30 days.</div>}
          {domains.slice(0, LIMIT).map(({ kind, c, days }) => (
            <button type="button" className="ov-row" key={c.id} onClick={() => openClient(kind, c.id)}>
              <div className="ov-row-main">
                <div className="ov-row-name">{c.client}</div>
                <div className="ov-row-sub">{c.domain || 'No domain name'} · {fmtDate(parseDateOnly(c.domainExpiry))}</div>
              </div>
              <div className="ov-row-side" style={{fontWeight:600, color: days < 0 ? 'var(--crit)' : 'var(--warn)'}}>{domainLabel(days)}</div>
            </button>
          ))}
          <More shown={LIMIT} total={domains.length} />
        </OvCard>

        <OvCard tone="good" title="Recent activity" button="View activity log" onButton={() => onNavigate('activity')}>
          {recent.length === 0 && <div className="ov-empty">No activity yet.</div>}
          {recent.slice(0, LIMIT).map((e, i) => (
            <div className="ov-row" key={i} style={{cursor:'default'}}>
              <div style={{display:'flex', gap:'10px', alignItems:'center', minWidth:0}}>
                <div className="log-dot" style={{background: actionColor(e.action), marginTop:0}} />
                <div className="ov-row-main">
                  <div className="ov-row-name">{e.name}</div>
                  <div className="ov-row-sub">{e.note}</div>
                </div>
              </div>
              <div className="ov-row-side" style={{color:'var(--ink-muted)', fontSize:'.74rem'}}>{timeAgo(e.t)}</div>
            </div>
          ))}
        </OvCard>
      </div>
    </section>
  );
}
