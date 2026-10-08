import { useApp } from '../state/AppContext.jsx';
import logo from '../assets/dta-logo.png';

export default function Sidebar({ page, onNavigate }){
  const { user, logout } = useApp();
  const items = [
    ['overview', user.role === 'admin' ? 'Overview' : 'My dashboard'],
    ['leads', user.role === 'admin' ? 'All leads' : 'My leads'],
    ['activity', user.role === 'admin' ? 'Activity feed' : 'My activity'],
    ...(user.role === 'admin' ? [['team', 'Sales team']] : []),
  ];
  return (
    <aside className="sidebar">
      <div className="brand"><img src={logo} alt="" width="34" height="34" /><div><div className="brand-name">DTA</div><div className="brand-sub">Sales</div></div></div>
      <nav>
        {items.map(([key, label]) => (
          <button key={key} className={'nav-item' + (page === key ? ' active' : '')} onClick={() => onNavigate(key)}>{label}</button>
        ))}
      </nav>
      <div className="sidebar-foot">
        <div className="who"><strong>{user.fullName}</strong><span>{user.role === 'admin' ? 'Admin' : user.state}</span></div>
        <button className="btn ghost" onClick={logout}>Log out</button>
      </div>
    </aside>
  );
}
