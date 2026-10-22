import { useState } from 'react';
import { useApp } from '../state/AppContext.jsx';

const SUGGESTIONS = ['Facebook', 'Instagram', 'LinkedIn', 'YouTube', 'X (Twitter)', 'WhatsApp', 'Google Business'];

// Extra named links for a client — social profiles, listings, anything with
// a web address. The dashboard only ever opens these in a new tab.
export default function ClientLinksSection({ c }){
  const { call, refreshFromBackend, showToast } = useApp();
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [label, setLabel] = useState('');
  const [url, setUrl] = useState('');
  const links = c.links || [];

  function add(e){
    e.preventDefault();
    let link = url.trim();
    if (link && !/^https?:\/\//i.test(link)) link = 'https://' + link;
    setBusy(true);
    call('addClientLink', { id: c.id, label: label.trim(), url: link })
      .then(() => { setLabel(''); setUrl(''); setAdding(false); showToast('Link added'); return refreshFromBackend(); })
      .catch((err) => showToast('Failed: ' + err.message))
      .finally(() => setBusy(false));
  }

  function remove(l){
    call('deleteClientLink', { linkId: l.id })
      .then(() => { showToast('Link removed'); return refreshFromBackend(); })
      .catch((err) => showToast('Failed: ' + err.message));
  }

  return (
    <div className="panel-section">
      <div className="section-head">
        <div className="section-head-title">Links</div>
        {!adding && <button className="btn btn-secondary btn-sm" type="button" onClick={() => setAdding(true)}>+ Add link</button>}
      </div>

      {links.length === 0 && !adding && <div className="page-sub">No extra links yet — add social profiles or other sites.</div>}
      {links.map((l) => (
        <div className="field-row" key={l.id} style={{alignItems:'center'}}>
          <span>{l.label}</span>
          <span style={{display:'flex', alignItems:'center', gap:'6px', minWidth:0}}>
            <a href={l.url} target="_blank" rel="noopener noreferrer" style={{color:'var(--accent)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{l.url}</a>
            <button className="btn btn-ghost btn-sm" type="button" aria-label={'Remove ' + l.label} title="Remove" onClick={() => remove(l)}>✕</button>
          </span>
        </div>
      ))}

      {adding && (
        <form onSubmit={add}>
          <div className="form-grid">
            <label className="full">Name
              <input type="text" list="client-link-names" autoComplete="off" required maxLength={100} placeholder="e.g. Instagram" value={label} onChange={(e) => setLabel(e.target.value)} />
              <datalist id="client-link-names">{SUGGESTIONS.map((s) => <option key={s} value={s} />)}</datalist>
            </label>
            <label className="full">Link
              <input type="text" autoComplete="off" required maxLength={500} placeholder="https://instagram.com/…" value={url} onChange={(e) => setUrl(e.target.value)} />
            </label>
          </div>
          <div style={{display:'flex', justifyContent:'flex-end', gap:'8px', marginTop:'10px'}}>
            <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setAdding(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>{busy ? 'Saving…' : 'Add link'}</button>
          </div>
        </form>
      )}
    </div>
  );
}
