import { useEffect, useState } from 'react';
import { useApp } from './state/AppContext.jsx';
import AuthScreen from './components/AuthScreen.jsx';
import Sidebar from './components/Sidebar.jsx';
import Overview from './pages/Overview.jsx';
import Clients from './pages/Clients.jsx';
import Activity from './pages/Activity.jsx';
import Team from './pages/Team.jsx';
import Files from './pages/Files.jsx';
import Settings from './pages/Settings.jsx';
import ClientDetailPanel from './components/ClientDetailPanel.jsx';
import AddClientModal from './components/AddClientModal.jsx';
import ManageAccessModal from './components/ManageAccessModal.jsx';
import Toast from './components/Toast.jsx';

export default function App(){
  const { isLoggedIn, auth, refreshFromBackend, selectedClientId, addClientOpen, accessModalFile, closeOverlays } = useApp();
  const [view, setView] = useState('overview');

  useEffect(() => {
    if (isLoggedIn){
      setView('overview');
      refreshFromBackend();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoggedIn]);

  useEffect(() => {
    function onEscape(e){ if (e.key === 'Escape') closeOverlays(); }
    document.addEventListener('keydown', onEscape);
    return () => document.removeEventListener('keydown', onEscape);
  }, [closeOverlays]);

  if (!isLoggedIn) return <AuthScreen />;

  const isAdmin = auth.user.role === 'admin';
  const overlayOpen = !!(selectedClientId || addClientOpen || accessModalFile);

  return (
    <div className="app">
      <Sidebar view={view} setView={setView} />
      <main className="main">
        <div className="main-inner">
          {view === 'overview' && <Overview />}
          {view === 'clients' && <Clients />}
          {view === 'activity' && <Activity />}
          {view === 'team' && isAdmin && <Team />}
          {view === 'files' && <Files />}
          {view === 'settings' && <Settings />}
        </div>
      </main>

      <div className={'backdrop' + (overlayOpen ? ' open' : '')} onClick={closeOverlays} />
      <ClientDetailPanel />
      <AddClientModal />
      <ManageAccessModal />
      <Toast />
    </div>
  );
}
