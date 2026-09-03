import { Pill } from '@/components/Pill';
import { fmtDate, fmtMoney } from '@/lib/format';
import type { Client, ClientStatus } from '@/lib/types';

export function ClientsView({
  connectedToBackend,
  rows,
  search,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  onAddClient,
  onView,
}: {
  connectedToBackend: boolean;
  rows: { c: Client; status: ClientStatus }[];
  search: string;
  onSearchChange: (v: string) => void;
  statusFilter: 'all' | ClientStatus;
  onStatusFilterChange: (v: 'all' | ClientStatus) => void;
  onAddClient: () => void;
  onView: (id: string) => void;
}) {
  return (
    <section>
      <div className="page-head">
        <div>
          <h1>Clients</h1>
          <div className="page-sub">Every client software DTA has deployed, with its subscription state.</div>
        </div>
        <button className="btn btn-primary" onClick={onAddClient}>
          + Add client
        </button>
      </div>

      <div className="toolbar" style={{ marginBottom: 14 }}>
        <div className="search">
          <input type="text" placeholder="Search clients or software…" value={search} onChange={(e) => onSearchChange(e.target.value)} />
        </div>
        <select value={statusFilter} onChange={(e) => onStatusFilterChange(e.target.value as 'all' | ClientStatus)}>
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="due">Due soon</option>
          <option value="overdue">Overdue</option>
          <option value="paused">Paused</option>
        </select>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Client</th>
              <th>Plan</th>
              <th>Next due</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="empty">
                  {connectedToBackend ? 'No clients match this search.' : 'Connect a backend in Settings to load clients.'}
                </td>
              </tr>
            ) : (
              rows.map(({ c, status }) => (
                <tr key={c.id} onClick={() => onView(c.id)}>
                  <td>
                    <div className="cell-name">{c.client}</div>
                    <div className="cell-sub">{c.software}</div>
                  </td>
                  <td className="tabular">
                    {fmtMoney(c.amount)} <span style={{ color: 'var(--ink-faint)' }}>/ {c.cycle === 'Monthly' ? 'mo' : 'yr'}</span>
                  </td>
                  <td className="tabular">{fmtDate(new Date(c.nextDue))}</td>
                  <td>
                    <Pill status={status} />
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
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
