import type { View } from '@/lib/hooks/useDashboard';

const NAV_MANAGE: { view: View; label: string }[] = [
  { view: 'overview', label: 'Overview' },
  { view: 'clients', label: 'Clients' },
  { view: 'activity', label: 'Activity Log' },
];

export function Sidebar({
  view,
  setView,
  connected,
  connectedToBackend,
}: {
  view: View;
  setView: (v: View) => void;
  connected: boolean;
  connectedToBackend: boolean;
}) {
  return (
    <nav className="sidebar" aria-label="Primary">
      <div className="brand">
        <div className="brand-mark" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <rect x="3" y="2" width="3.4" height="12" rx="1.6" fill="var(--accent-ink)" />
            <rect x="9.6" y="2" width="3.4" height="12" rx="1.6" fill="var(--accent-ink)" />
          </svg>
        </div>
        <div>
          <div className="brand-name">DTA</div>
          <div className="brand-sub">Subscription Control</div>
        </div>
      </div>

      <div>
        <div className="nav-group-label">Manage</div>
        <div className="nav" role="tablist">
          {NAV_MANAGE.map((item) => (
            <button key={item.view} className="nav-btn" aria-current={view === item.view ? 'page' : undefined} onClick={() => setView(item.view)}>
              {item.label}
            </button>
          ))}
        </div>
        <div className="nav-group-label">Build</div>
        <div className="nav">
          <button className="nav-btn" aria-current={view === 'settings' ? 'page' : undefined} onClick={() => setView('settings')}>
            Settings
          </button>
        </div>
      </div>

      <div className="sidebar-foot">
        <div>
          <span className={'conn-dot ' + (connected ? 'ok' : connectedToBackend ? 'bad' : '')} />
          <span>{connected ? 'Connected' : connectedToBackend ? 'Connection failed' : 'Not connected'}</span>
        </div>
        <div style={{ marginTop: 6 }}>
          Signed in as <b>DTA Admin</b>
        </div>
      </div>
    </nav>
  );
}
