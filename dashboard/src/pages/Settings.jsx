import { useEffect, useState } from 'react';
import { useApp } from '../state/AppContext.jsx';

export default function Settings(){
  const { auth, settings, call, refreshFromBackend, showToast } = useApp();
  const [name, setName] = useState(settings.name);
  const [lead, setLead] = useState(settings.lead);
  const [grace, setGrace] = useState(settings.grace);
  const isAdmin = auth.user.role === 'admin';

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

      {isAdmin && <IdFormatCard />}
    </section>
  );
}

function IdFormatCard(){
  const { settings, call, refreshFromBackend, showToast } = useApp();
  const [idPrefix, setIdPrefix] = useState(settings.idPrefix);
  const [idDigits, setIdDigits] = useState(settings.idDigits);

  useEffect(() => { setIdPrefix(settings.idPrefix); setIdDigits(settings.idDigits); }, [settings]);

  const preview = (idPrefix || '') + String(1).padStart(Number(idDigits) || 1, '0');

  function submit(e){
    e.preventDefault();
    const prefix = (idPrefix || '').trim();
    if (!prefix){ showToast('ID prefix is required'); return; }
    call('updateIdFormat', { idPrefix: prefix, idDigits: Number(idDigits) || 3 }).then(() => {
      showToast('Client ID format saved');
      return refreshFromBackend();
    }).catch((err) => showToast('Failed: ' + err.message));
  }

  return (
    <div className="card" style={{padding:'20px 22px', marginTop:'18px'}}>
      <h2 style={{fontSize:'1rem', marginBottom:'4px'}}>Client ID format</h2>
      <div className="page-sub" style={{marginBottom:'14px'}}>
        Admin only. Changes what ID new clients and invoices get going forward — existing IDs are left exactly as they are.
      </div>
      <form className="settings-form" onSubmit={submit}>
        <label>ID prefix
          <input type="text" autoComplete="off" maxLength={20} value={idPrefix} onChange={(e) => setIdPrefix(e.target.value)} />
        </label>
        <label>Number of digits
          <input type="number" min="1" max="6" value={idDigits} onChange={(e) => setIdDigits(e.target.value)} />
        </label>
        <div className="page-sub">Next new client would get: <b>{preview}</b></div>
        <div><button type="submit" className="btn btn-primary">Save ID format</button></div>
      </form>
    </div>
  );
}
