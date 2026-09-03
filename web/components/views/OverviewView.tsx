import { Pill } from '@/components/Pill';
import { diffDays, fmtDate, fmtMoney } from '@/lib/format';
import type { Client, ClientStatus } from '@/lib/types';

export function OverviewView({
  today,
  connectedToBackend,
  clientCount,
  counts,
  mrr,
  rows,
  onAddClient,
  onView,
}: {
  today: Date;
  connectedToBackend: boolean;
  clientCount: number;
  counts: { active: number; due: number; overdue: number; paused: number };
  mrr: number;
  rows: { c: Client; status: ClientStatus }[];
  onAddClient: () => void;
  onView: (id: string) => void;
}) {
  return (
    <section>
      <div className="page-head">
        <div>
          <h1>Overview</h1>
          <div className="page-sub">Every client running DTA-built software, and what needs attention today.</div>
        </div>
        <button className="btn btn-primary" onClick={onAddClient}>
          + Add client
        </button>
      </div>

      <div className="stat-grid">
        <div className="card stat-tile">
          <div className="stat-label">Total clients</div>
          <div className="stat-value tabular">{clientCount}</div>
          <div className="stat-note">across all DTA builds</div>
        </div>
        <div className="card stat-tile">
          <div className="stat-label">Active</div>
          <div className="stat-value tabular">{counts.active}</div>
          <div className="stat-note">in good standing</div>
        </div>
        <div className="card stat-tile tone-crit">
          <div className="stat-label">Payment due / overdue</div>
          <div className="stat-value tabular">{counts.due + counts.overdue}</div>
          <div className="stat-note">{counts.overdue} overdue</div>
        </div>
        <div className="card stat-tile tone-warn">
          <div className="stat-label">Paused</div>
          <div className="stat-value tabular">{counts.paused}</div>
          <div className="stat-note">access currently locked</div>
        </div>
        <div className="card stat-tile">
          <div className="stat-label">Est. monthly recurring</div>
          <div className="stat-value tabular">{fmtMoney(Math.round(mrr))}</div>
          <div className="stat-note">from active + due plans</div>
        </div>
      </div>

      <div className="section-title">
        <h2>Needs attention</h2>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Client</th>
              <th>Software</th>
              <th>Status</th>
              <th>Next due</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="empty">
                  {connectedToBackend ? 'Nothing needs attention — every client is current.' : 'Connect a backend in Settings to load clients.'}
                </td>
              </tr>
            ) : (
              rows.map(({ c, status }) => {
                const d = diffDays(new Date(c.nextDue), today);
                return (
                  <tr key={c.id} onClick={() => onView(c.id)}>
                    <td className="cell-name">{c.client}</td>
                    <td>{c.software}</td>
                    <td>
                      <Pill status={status} />
                    </td>
                    <td className="tabular">
                      {fmtDate(new Date(c.nextDue))}
                      <div className="cell-sub">{d < 0 ? Math.abs(d) + ' days overdue' : d + ' days left'}</div>
                    </td>
                    <td className="row-actions">
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          onView(c.id);
                        }}
                      >
                        View
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
