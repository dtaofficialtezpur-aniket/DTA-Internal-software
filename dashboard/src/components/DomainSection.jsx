import { useEffect, useState } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { DOMAIN_WARN_DAYS, domainDaysLeft, domainLabel, fmtDate, parseDateOnly } from '../utils.js';

// Domain + website link + domain expiry date for either client type. The
// dashboard warns (Overview list, sidebar badge, a message on login) when a
// domain is within DOMAIN_WARN_DAYS of expiring or already expired.
export default function DomainSection({ c, clientType }){
  const { call, refreshFromBackend, showToast } = useApp();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [domain, setDomain] = useState('');
  const [url, setUrl] = useState('');
  const [expiry, setExpiry] = useState('');

  useEffect(() => {
    setEditing(false);
    setDomain(c.domain || ''); setUrl(c.websiteUrl || ''); setExpiry(c.domainExpiry || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c.id, c.domain, c.websiteUrl, c.domainExpiry]);

  const days = domainDaysLeft(c);
  const pill = days === null ? null : days < 0 ? 'pill-overdue' : days <= DOMAIN_WARN_DAYS ? 'pill-due' : 'pill-active';

  function save(e){
    e.preventDefault();
    let link = url.trim();
    if (link && !/^https?:\/\//i.test(link)) link = 'https://' + link;
    setBusy(true);
    call('updateClientDomain', { clientType, id: c.id, domain: domain.trim(), websiteUrl: link, domainExpiry: expiry })
      .then(() => { showToast('Domain details saved'); setEditing(false); return refreshFromBackend(); })
      .catch((err) => showToast('Failed: ' + err.message))
      .finally(() => setBusy(false));
  }

  const hasAny = c.domain || c.websiteUrl || c.domainExpiry;

  return (
    <div>
      <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'8px'}}>
        <div style={{fontSize:'.78rem', fontWeight:700, color:'var(--ink-muted)'}}>Domain &amp; website</div>
        {!editing && <button className="btn btn-ghost btn-sm" type="button" onClick={() => setEditing(true)}>{hasAny ? 'Edit' : 'Add domain'}</button>}
      </div>

      {!editing && !hasAny && <div className="page-sub">No domain added yet.</div>}
      {!editing && hasAny && (
        <div>
          <div className="field-row"><span>Domain</span><span>{c.domain || '—'}</span></div>
          <div className="field-row"><span>Website</span>
            <span>{c.websiteUrl
              ? <a href={c.websiteUrl} target="_blank" rel="noopener noreferrer" style={{color:'var(--accent)'}}>{c.websiteUrl}</a>
              : '—'}</span>
          </div>
          <div className="field-row"><span>Domain expires</span>
            <span>{c.domainExpiry
              ? <>{fmtDate(parseDateOnly(c.domainExpiry))} <span className={'pill ' + pill} style={{marginLeft:'6px'}}>{domainLabel(days)}</span></>
              : '—'}</span>
          </div>
        </div>
      )}

      {editing && (
        <form onSubmit={save}>
          <div className="form-grid">
            <label className="full">Domain name
              <input type="text" autoComplete="off" maxLength={255} placeholder="example.com" value={domain} onChange={(e) => setDomain(e.target.value)} />
            </label>
            <label className="full">Website link
              <input type="text" autoComplete="off" maxLength={500} placeholder="https://example.com" value={url} onChange={(e) => setUrl(e.target.value)} />
            </label>
            <label className="full">Domain expiry date
              <input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
            </label>
          </div>
          <div style={{display:'flex', justifyContent:'flex-end', gap:'8px', marginTop:'10px'}}>
            <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setEditing(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
          </div>
        </form>
      )}
    </div>
  );
}
