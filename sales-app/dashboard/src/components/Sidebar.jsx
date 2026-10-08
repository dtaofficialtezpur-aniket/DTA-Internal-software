import { useEffect, useState } from 'react';
import { useApp } from '../state/AppContext.jsx';
import logo from '../assets/dta-logo.png';

export default function Sidebar({ page, onNavigate }){
  const { user, logout, call, pendingDemos, setPendingDemos } = useApp();
  // Only present inside the desktop app: shows a button once an update has finished downloading.
  const [update, setUpdate] = useState(null);
  // Keeps the "pending demo requests" badge fresh (admin: all requests; employee: own).
  useEffect(() => {
    let live = true;
    const tick = () => call('listDemoRequests', { status: 'pending' }).then((d) => live && setPendingDemos(d.pending)).catch(() => {});
    tick();
    const id = setInterval(tick, 60000);
    return () => { live = false; clearInterval(id); };
  }, [call, setPendingDemos]);
  useEffect(() => { window.electronAPI?.onUpdateReady?.((info) => setUpdate(info)); }, []);
  const items = [
    ['overview', user.role === 'admin' ? 'Overview' : 'My dashboard'],
    ['leads', user.role === 'admin' ? 'All leads' : 'My leads'],
    ['monthly', 'Monthly business'],
    ['activity', user.role === 'admin' ? 'Activity feed' : 'My activity'],
    ['demos', user.role === 'admin' ? 'Demo requests' : 'Demo requests'],
    ...(user.role === 'admin' ? [['team', 'Sales team']] : []),
  ];
  return (
    <aside className="sidebar">
      <div className="brand"><img src={logo} alt="" width="34" height="34" /><div><div className="brand-name">DTA</div><div className="brand-sub">Sales</div></div></div>
      <nav>
        {items.map(([key, label]) => (
          <button key={key} className={'nav-item' + (page === key ? ' active' : '')} onClick={() => onNavigate(key)}>{label}{key === 'demos' && user.role === 'admin' && pendingDemos > 0 && <span className="badge">{pendingDemos}</span>}</button>
        ))}
      </nav>
      <div className="sidebar-foot">
        {update && <button className="btn primary" onClick={() => window.electronAPI.installUpdate()}>Restart to update ({update.version})</button>}
        <div className="who"><strong>{user.fullName}</strong><span>{user.role === 'admin' ? 'Admin' : user.state}</span></div>
        <button className="btn ghost" onClick={logout}>Log out</button>
      </div>
    </aside>
  );
}
