import { useEffect, useState } from 'react';
import { useApp } from '../state/AppContext.jsx';
import logo from '../assets/dta-logo.png';

const NAV_ITEMS = [
  { key: 'overview', label: 'Overview', group: 'Manage', icon: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="2.5" y="2.5" width="6.5" height="6.5" rx="1.4"/><rect x="11" y="2.5" width="6.5" height="6.5" rx="1.4"/><rect x="2.5" y="11" width="6.5" height="6.5" rx="1.4"/><rect x="11" y="11" width="6.5" height="6.5" rx="1.4"/></svg>
  ) },
  { key: 'clients', label: 'Clients', group: 'Manage', icon: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="7" cy="6.5" r="2.6"/><path d="M2.3 16c.7-3 2.4-4.6 4.7-4.6s4 1.6 4.7 4.6"/><circle cx="14.3" cy="7.3" r="2.1"/><path d="M12.7 11.7c1.9.2 3.3 1.6 3.9 4"/></svg>
  ) },
  { key: 'activity', label: 'Activity Log', group: 'Manage', icon: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="10" cy="10" r="7.3"/><path d="M10 5.8V10l3 2"/></svg>
  ) },
  { key: 'files', label: 'Files', group: 'Manage', icon: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M2.5 6.2c0-.9.7-1.6 1.6-1.6h3.4l1.6 1.8h6.8c.9 0 1.6.7 1.6 1.6v6.4c0 .9-.7 1.6-1.6 1.6H4.1c-.9 0-1.6-.7-1.6-1.6z"/></svg>
  ) },
  { key: 'settings', label: 'Settings', group: 'Build', icon: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="10" cy="10" r="2.6"/><path d="M10 2.8v2.1M10 15.1v2.1M17.2 10h-2.1M4.9 10H2.8M15 5l-1.5 1.5M6.5 13.5 5 15M15 15l-1.5-1.5M6.5 6.5 5 5"/></svg>
  ) },
];
const TEAM_ITEM = { key: 'team', label: 'Team', icon: (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="7" cy="6.5" r="2.6"/><path d="M2.3 16c.7-3 2.4-4.6 4.7-4.6s4 1.6 4.7 4.6"/><circle cx="14.3" cy="7.3" r="2.1"/><path d="M12.7 11.7c1.9.2 3.3 1.6 3.9 4"/><path d="M17 6.5v4M15 8.5h4" strokeLinecap="round"/></svg>
) };

function useUpdateReady(){
  const [update, setUpdate] = useState(null);
  useEffect(() => {
    if (!window.electronAPI || !window.electronAPI.onUpdateReady) return;
    window.electronAPI.onUpdateReady((info) => setUpdate(info));
  }, []);
  return update;
}

function useAppVersion(){
  const [version, setVersion] = useState(null);
  useEffect(() => {
    if (!window.electronAPI || !window.electronAPI.getAppVersion) return;
    window.electronAPI.getAppVersion().then(setVersion).catch(() => {});
  }, []);
  return version;
}

export default function Sidebar({ view, setView }){
  const { auth, doLogout, pendingCount } = useApp();
  const isAdmin = auth.user.role === 'admin';
  const update = useUpdateReady();
  const version = useAppVersion();

  return (
    <nav className="sidebar" aria-label="Primary">
      <div className="brand">
        <div className="brand-mark" aria-hidden="true">
          <img src={logo} alt="" width="34" height="34" />
        </div>
        <div>
          <div className="brand-name">DTA</div>
          <div className="brand-sub">Digital department</div>
        </div>
      </div>

      <div>
        <div className="nav-group-label">Manage</div>
        <div className="nav" role="tablist">
          {NAV_ITEMS.filter((i) => i.group === 'Manage').map((i) => (
            <NavBtn key={i.key} item={i} active={view === i.key} onClick={() => setView(i.key)} />
          ))}
        </div>
        <div className="nav-group-label">Build</div>
        <div className="nav">
          {NAV_ITEMS.filter((i) => i.group === 'Build').map((i) => (
            <NavBtn key={i.key} item={i} active={view === i.key} onClick={() => setView(i.key)} />
          ))}
        </div>
        {isAdmin && (
          <>
            <div className="nav-group-label">Admin</div>
            <div className="nav">
              <NavBtn item={TEAM_ITEM} active={view === 'team'} onClick={() => setView('team')} />
            </div>
          </>
        )}
      </div>

      <div className="sidebar-foot">
        {pendingCount > 0 && (
          <div style={{fontSize:'.72rem', color:'var(--ink-faint)', marginBottom:'8px'}}>
            {pendingCount} change{pendingCount === 1 ? '' : 's'} waiting to sync
          </div>
        )}
        {update && (
          <button className="btn btn-primary btn-sm btn-block" style={{marginBottom:'8px'}} onClick={() => window.electronAPI.installUpdate()}>
            Update {update.version ? 'v' + update.version + ' ' : ''}ready — restart to install
          </button>
        )}
        <div>Signed in as <b>{auth.user.fullName}</b><br /><span>{isAdmin ? 'Admin' : 'Employee'}</span></div>
        <button id="logout-btn" className="btn btn-ghost btn-sm btn-block" style={{marginTop:'8px'}} onClick={doLogout}>Log out</button>
        {version && <div style={{fontSize:'.7rem', color:'var(--ink-faint)', marginTop:'8px'}}>v{version}</div>}
      </div>
    </nav>
  );
}

function NavBtn({ item, active, onClick }){
  return (
    <button className="nav-btn" data-view={item.key} aria-current={active ? 'page' : undefined} onClick={onClick}>
      {item.icon}
      {item.label}
    </button>
  );
}
