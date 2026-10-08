import { useState } from 'react';
import { useApp } from '../state/AppContext.jsx';

// Admin-only: lets an admin directly rename one client's ID. Anyone else
// doesn't even see the button -- the backend also rejects the call from
// a non-admin, this just avoids showing a control they can't use.
export default function EditClientIdButton({ c, clientType }){
  const { auth, call, refreshFromBackend, showToast, setSelectedClientId, setSelectedNormalClientId } = useApp();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(c.id);
  const [busy, setBusy] = useState(false);

  if (auth.user.role !== 'admin') return null;

  function submit(e){
    e.preventDefault();
    const newId = value.trim();
    if (!newId || newId === c.id){ setOpen(false); return; }
    setBusy(true);
    call('updateClientId', { clientType, id: c.id, newId }).then(() => {
      showToast('Client ID changed to ' + newId);
      setOpen(false);
      return refreshFromBackend().then(() => {
        if (clientType === 'normal') setSelectedNormalClientId(newId);
        else setSelectedClientId(newId);
      });
    }).catch((err) => showToast('Failed: ' + err.message))
      .finally(() => setBusy(false));
  }

  if (!open){
    return (
      <button className="btn btn-ghost btn-sm" type="button" onClick={() => { setValue(c.id); setOpen(true); }}>
        Edit ID
      </button>
    );
  }

  return (
    <form onSubmit={submit} style={{marginTop:'6px'}}>
      {clientType === 'subscription' && (
        <div className="page-sub" style={{marginBottom:'6px'}}>
          Changing this won't change the API key, but the client's deployed software checks in with ID + key together — it'll stop working until it's reconfigured with the new ID.
        </div>
      )}
      <div style={{display:'flex', gap:'6px', alignItems:'center'}}>
        <input type="text" autoComplete="off" maxLength={32} value={value} onChange={(e) => setValue(e.target.value)} style={{flex:1}} />
        <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  );
}
