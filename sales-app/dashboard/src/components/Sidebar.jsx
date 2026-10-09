import { useEffect, useState } from 'react';
import { useApp } from '../state/AppContext.jsx';
import Logo from './Logo.jsx';

export default function Sidebar({ page, onNavigate }){
  const { user, logout, call, pendingDemos, setPendingDemos } = useApp();
  // Only present inside the desktop app: shows a button once an update has finished downloading.
  const [update, setUpdate] = useState(null);
  // Keeps the "pending demo requests" badge fresh (admin: all requests; employee: own).
  useEffect(() => {
    let live = true;
    const tick = () => call('listDemoRequests', { status: 'pending' }).then((d) => live && setPendingDemos(user.role === 'admin' ? d.pending : d.scheduled)).catch(() => {});
    tick();
    const id = setInterval(tick, 60000);
    return () => { live = false; clearInterval(id); };
  }, [call, setPendingDemos, user.role]);
  useEffect(() => { window.electronAPI?.onUpdateReady?.((info) => setUpdate(info)); }, []);
  const items = [
    ['overview', user.role === 'admin' ? 'Overview' : 'My dashboard'],
    ['leads', user.role === 'admin' ? 'All leads' : 'My leads'],
    ['monthly', 'Monthly business'],
    ['activity', user.role === 'admin' ? 'Activity feed' : 'My activity'],
    ['demos', 'Demo requests'],
    ['plan', 'Sales plan'],
    ['official', 'Official links'],
    ...(user.role === 'admin' ? [['team', 'Sales team']] : []),
  ];
  return (
    <aside className="sidebar">
      <div className="brand"><Logo width={46} /><div><div className="brand-name">DTA Sales</div><div className="brand-sub">Sales portal</div></div></div>
      <nav>
        {items.map(([key, label]) => (
          <button key={key} className={'nav-item' + (page === key ? ' active' : '')} onClick={() => onNavigate(key)}>{label}{key === 'demos' && pendingDemos > 0 && <span className={'badge' + (user.role === 'admin' ? '' : ' good')} title={user.role === 'admin' ? 'Pending demo requests' : 'Upcoming scheduled demos'}>{pendingDemos}</span>}</button>
        ))}
      </nav>
      <div className="sidebar-foot">
        <a className="site-link" href="https://dtaonline.in" target="_blank" rel="noopener noreferrer">dtaonline.in ↗</a>
        {update && <button className="btn primary" onClick={() => window.electronAPI.installUpdate()}>Restart to update ({update.version})</button>}
        <div className="who"><strong>{user.fullName}</strong><span>{user.role === 'admin' ? 'Admin' : user.state}</span></div>
        <button className="btn ghost" onClick={logout}>Log out</button>
      </div>
    </aside>
  );
}
