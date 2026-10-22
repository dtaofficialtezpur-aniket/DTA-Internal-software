import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { BACKEND_URL } from '../constants.js';
import { fmtBytes, fmtDate } from '../utils.js';

// Contracts and other paperwork kept against a client for future
// reference. Files are stored on the backend and only ever served through a
// logged-in request (the uploads folder can't be opened directly).
export default function ClientDocumentsSection({ clientId }){
  const { auth, call, showToast } = useApp();
  const [docs, setDocs] = useState([]);
  const [busy, setBusy] = useState(false);
  const [confirmId, setConfirmId] = useState(null);
  const fileRef = useRef(null);
  const isAdmin = auth.user.role === 'admin';

  const load = useCallback(() => {
    call('listClientDocuments', { clientId }).then((data) => setDocs(data.documents || [])).catch(() => {});
  }, [call, clientId]);

  useEffect(() => { setDocs([]); setConfirmId(null); load(); }, [clientId]); // eslint-disable-line react-hooks/exhaustive-deps

  function upload(e){
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const fd = new FormData();
    fd.append('action', 'uploadClientDocument');
    fd.append('token', auth.token);
    fd.append('clientId', clientId);
    fd.append('file', file);
    setBusy(true);
    fetch(BACKEND_URL, { method: 'POST', body: fd }).then((res) => res.json()).then((data) => {
      if (data.error) throw new Error(data.error);
      showToast('Document uploaded');
      load();
    }).catch((err) => showToast('Upload failed: ' + err.message))
      .finally(() => setBusy(false));
  }

  function download(d){
    fetch(BACKEND_URL, {
      method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'downloadClientDocument', token: auth.token, docId: d.id }),
    }).then((res) => {
      if ((res.headers.get('Content-Type') || '').includes('application/json')){
        return res.json().then((data) => { throw new Error(data.error || 'Download failed.'); });
      }
      return res.blob().then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = d.filename;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 4000);
      });
    }).catch((err) => showToast('Download failed: ' + err.message));
  }

  function remove(d){
    if (confirmId !== d.id){ setConfirmId(d.id); return; }
    call('deleteClientDocument', { docId: d.id })
      .then(() => { showToast('Document deleted'); setConfirmId(null); load(); })
      .catch((err) => showToast('Failed: ' + err.message));
  }

  return (
    <div className="panel-section">
      <div className="section-head">
        <div className="section-head-title">Documents</div>
        <button className="btn btn-secondary btn-sm" type="button" disabled={busy} onClick={() => fileRef.current && fileRef.current.click()}>
          {busy ? 'Uploading…' : '+ Upload document'}
        </button>
        <input ref={fileRef} type="file" style={{display:'none'}} onChange={upload}
          accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.rtf,.jpg,.jpeg,.png,.gif,.webp,.zip" />
      </div>

      {docs.length === 0
        ? <div className="page-sub">No documents yet — keep contracts and agreements here (PDF, Word, Excel, images; up to 25 MB each).</div>
        : (
          <div className="log-list">
            {docs.map((d) => (
              <div className="log-row" key={d.id} style={{alignItems:'center'}}>
                <div style={{flex:1, minWidth:0}}>
                  <div className="log-text" style={{overflow:'hidden', textOverflow:'ellipsis'}}>{d.filename}</div>
                  <div className="log-time">{fmtBytes(d.size)} · {fmtDate(new Date(d.uploadedAt.replace(' ', 'T')))}</div>
                </div>
                <button className="btn btn-secondary btn-sm" type="button" onClick={() => download(d)}>Download</button>
                {(isAdmin || d.uploadedBy === auth.user.id) && (
                  <button className="btn btn-ghost btn-sm" type="button" onClick={() => remove(d)}>{confirmId === d.id ? 'Confirm?' : 'Delete'}</button>
                )}
              </div>
            ))}
          </div>
        )}
    </div>
  );
}
