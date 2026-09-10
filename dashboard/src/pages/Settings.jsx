import { useEffect, useState } from 'react';
import { useApp } from '../state/AppContext.jsx';

export default function Settings(){
  const { settings, call, refreshFromBackend, showToast } = useApp();
  const [name, setName] = useState(settings.name);
  const [lead, setLead] = useState(settings.lead);
  const [grace, setGrace] = useState(settings.grace);

  useEffect(() => { setName(settings.name); setLead(settings.lead); setGrace(settings.grace); }, [settings]);

  function submit(e){
    e.preventDefault();
    call('updateSettings', {
      name: (name || '').trim() || 'DTA',
      lead: Number(lead) || 7,
      grace: Number(grace) || 5,
    }).then(() => {
      showToast('Settings saved');
      return refreshFromBackend();
    }).catch((err) => showToast('Failed: ' + err.message));
  }

  return (
    <section>
      <div className="page-head"><div>
        <h1>Settings</h1>
        <div className="page-sub">Defaults used across every client's subscription check.</div>
      </div></div>

      <div className="card" style={{padding:'20px 22px'}}>
        <h2 style={{fontSize:'1rem', marginBottom:'4px'}}>Defaults</h2>
        <div className="page-sub" style={{marginBottom:'14px'}}>Stored on the backend, shared by every client check-in.</div>
        <form className="settings-form" onSubmit={submit}>
          <label>Agency display name
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label>"Due soon" warning window (days before the due date)
            <input type="number" min="1" max="30" value={lead} onChange={(e) => setLead(e.target.value)} />
          </label>
          <label>Default grace period for new clients (days)
            <input type="number" min="0" max="30" value={grace} onChange={(e) => setGrace(e.target.value)} />
          </label>
          <div><button type="submit" className="btn btn-primary">Save settings</button></div>
        </form>
      </div>
    </section>
  );
}
