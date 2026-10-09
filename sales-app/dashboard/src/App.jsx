import { useState } from 'react';
import { useApp } from './state/AppContext.jsx';
import AuthScreen from './components/AuthScreen.jsx';
import Sidebar from './components/Sidebar.jsx';
import Overview from './pages/Overview.jsx';
import Leads from './pages/Leads.jsx';
import Activity from './pages/Activity.jsx';
import Demos from './pages/Demos.jsx';
import Monthly from './pages/Monthly.jsx';
import Plan from './pages/Plan.jsx';
import Official from './pages/Official.jsx';
import LiveClock from './components/LiveClock.jsx';
import Team from './pages/Team.jsx';

export default function App(){
  const { user, toast } = useApp();
  const [page, setPage] = useState('overview');
  // Lets the Team page jump to another page already filtered to one employee.
  const [focusUser, setFocusUser] = useState(null);

  const go = (p, userId = null) => { setFocusUser(userId); setPage(p); };

  return (
    <>
      {!user ? <AuthScreen /> : (
        <div className="app">
          <Sidebar page={page} onNavigate={(p) => go(p)} />
          <main className="main">
            <div className="topbar"><LiveClock /></div>
            {page === 'overview' && <Overview onOpenEmployee={(id) => go('leads', id)} />}
            {page === 'leads' && <Leads key={'l' + focusUser} initialUserId={focusUser} />}
            {page === 'activity' && <Activity key={'a' + focusUser} initialUserId={focusUser} />}
            {page === 'monthly' && <Monthly key={'m' + focusUser} initialUserId={focusUser} />}
            {page === 'demos' && <Demos />}
            {page === 'plan' && <Plan />}
            {page === 'official' && <Official />}
            {page === 'team' && user.role === 'admin' && <Team onOpen={go} />}
          </main>
        </div>
      )}
      {toast && <div className={'toast ' + toast.kind} role="status">{toast.msg}</div>}
    </>
  );
}
