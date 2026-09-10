import { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { BACKEND_URL } from '../constants.js';
import { fmtBytes, fmtDate } from '../utils.js';

function folderPathById(folders, id){
  const parts = [];
  let guard = 0;
  while (id !== null && id !== undefined && guard++ < 50){
    const f = folders.find((x) => x.id === id);
    if (!f) break;
    parts.unshift(f.name);
    id = f.parentId;
  }
  return parts.length ? parts.join(' / ') : '(root)';
}

function buildFolderOptions(folders){
  const byParent = {};
  folders.forEach((f) => {
    const key = f.parentId === null ? 'root' : f.parentId;
    (byParent[key] = byParent[key] || []).push(f);
  });
  const out = [];
  function walk(parentKey, depth){
    (byParent[parentKey] || []).forEach((f) => {
      out.push({ id: f.id, label: '— '.repeat(depth) + f.name });
      walk(f.id, depth + 1);
    });
  }
  walk('root', 0);
  return out;
}

export function downloadFile(token, f, showToast){
  fetch(BACKEND_URL, {
    method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: 'downloadFile', token, fileId: f.id }),
  }).then((res) => {
    const ct = res.headers.get('Content-Type') || '';
    if (ct.includes('application/json')){
      return res.json().then((data) => { throw new Error(data.error || 'Download failed.'); });
    }
    return res.blob().then((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = f.filename;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    });
  }).catch((err) => showToast('Download failed: ' + err.message));
}

export default function Files(){
  const { call, showToast, auth, folders, setFolders, files, setFiles, setAccessModalFile } = useApp();
  const isAdmin = auth.user.role === 'admin';
  const [folderName, setFolderName] = useState('');
  const [folderParent, setFolderParent] = useState('');
  const [uploadFolder, setUploadFolder] = useState('');
  const [confirmDeleteFolder, setConfirmDeleteFolder] = useState(null);
  const [confirmDeleteFile, setConfirmDeleteFile] = useState(null);

  const loadFolders = useCallback(() => {
    call('listFolders').then((data) => setFolders(data.folders))
      .catch((err) => showToast('Could not load folders: ' + err.message));
  }, [call, setFolders, showToast]);

  const loadFiles = useCallback(() => {
    call('listFiles').then((data) => setFiles(data.files))
      .catch((err) => showToast('Could not load files: ' + err.message));
  }, [call, setFiles, showToast]);

  useEffect(() => {
    if (isAdmin) loadFolders();
    loadFiles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const folderOptions = useMemo(() => buildFolderOptions(folders), [folders]);

  function createFolder(e){
    e.preventDefault();
    call('createFolder', { name: folderName.trim(), parentId: folderParent || null }).then(() => {
      showToast('Folder created');
      setFolderName(''); setFolderParent('');
      loadFolders();
    }).catch((err) => showToast('Failed: ' + err.message));
  }

  function deleteFolder(id){
    if (confirmDeleteFolder !== id){ setConfirmDeleteFolder(id); return; }
    call('deleteFolder', { folderId: id })
      .then(() => { showToast('Folder deleted'); setConfirmDeleteFolder(null); loadFolders(); })
      .catch((err) => showToast('Failed: ' + err.message));
  }

  function deleteFile(id){
    if (confirmDeleteFile !== id){ setConfirmDeleteFile(id); return; }
    call('deleteFile', { fileId: id })
      .then(() => { showToast('File deleted'); setConfirmDeleteFile(null); loadFiles(); })
      .catch((err) => showToast('Failed: ' + err.message));
  }

  function uploadFile(e){
    e.preventDefault();
    const input = e.target.elements.file;
    if (!input.files.length) return;
    const fd = new FormData();
    fd.append('action', 'uploadFile');
    fd.append('token', auth.token);
    fd.append('folderId', uploadFolder || '');
    fd.append('file', input.files[0]);
    fetch(BACKEND_URL, { method: 'POST', body: fd }).then((res) => res.json()).then((data) => {
      if (data.error) throw new Error(data.error);
      showToast('File uploaded');
      e.target.reset();
      setUploadFolder('');
      loadFiles();
    }).catch((err) => showToast('Upload failed: ' + err.message));
  }

  return (
    <section>
      <div className="page-head"><div>
        <h1>Files</h1>
        <div className="page-sub">{isAdmin ? 'Upload files into folders and choose which employees can access each one.' : 'Files your admin has shared with you.'}</div>
      </div></div>

      {isAdmin && (
        <div>
          <div className="card" style={{padding:'20px 22px', marginBottom:'18px'}}>
            <h2 style={{fontSize:'1rem', marginBottom:'4px'}}>Folders</h2>
            <div className="page-sub" style={{marginBottom:'14px'}}>Create folders to organize files. A folder must be empty before it can be deleted.</div>
            <form id="create-folder-form" onSubmit={createFolder} style={{display:'flex', alignItems:'flex-end', gap:'10px', flexWrap:'wrap'}}>
              <label style={{display:'flex', flexDirection:'column', gap:'5px', fontSize:'.82rem', fontWeight:600, color:'var(--ink-muted)', flex:1, minWidth:'160px'}}>Folder name
                <input id="cf-name" type="text" required value={folderName} onChange={(e) => setFolderName(e.target.value)} />
              </label>
              <label style={{display:'flex', flexDirection:'column', gap:'5px', fontSize:'.82rem', fontWeight:600, color:'var(--ink-muted)', flex:1, minWidth:'160px'}}>Parent folder
                <select id="cf-parent" value={folderParent} onChange={(e) => setFolderParent(e.target.value)}>
                  <option value="">(root)</option>
                  {folderOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
              </label>
              <div><button type="submit" className="btn btn-primary">Create folder</button></div>
            </form>
            <div className="table-wrap" style={{marginTop:'16px'}}>
              <table><thead><tr><th>Folder</th><th>Path</th><th></th></tr></thead>
                <tbody>
                  {folders.length === 0 && <tr><td colSpan="3" className="empty">No folders yet.</td></tr>}
                  {folders.map((f) => (
                    <tr key={f.id}>
                      <td className="cell-name">{f.name}</td>
                      <td>{folderPathById(folders, f.id)}</td>
                      <td className="row-actions"><button className="btn btn-danger btn-sm" data-delete-folder={f.id} onClick={() => deleteFolder(f.id)}>{confirmDeleteFolder === f.id ? 'Click again to confirm' : 'Delete'}</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card" style={{padding:'20px 22px', marginBottom:'18px'}}>
            <h2 style={{fontSize:'1rem', marginBottom:'4px'}}>Upload a file</h2>
            <form id="upload-file-form" onSubmit={uploadFile} style={{display:'flex', alignItems:'flex-end', gap:'10px', flexWrap:'wrap'}}>
              <label style={{display:'flex', flexDirection:'column', gap:'5px', fontSize:'.82rem', fontWeight:600, color:'var(--ink-muted)', flex:1, minWidth:'160px'}}>Folder
                <select id="uf-folder" value={uploadFolder} onChange={(e) => setUploadFolder(e.target.value)}>
                  <option value="">(root)</option>
                  {folderOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
              </label>
              <label style={{display:'flex', flexDirection:'column', gap:'5px', fontSize:'.82rem', fontWeight:600, color:'var(--ink-muted)', flex:2, minWidth:'200px'}}>File
                <input id="uf-file" type="file" name="file" required />
              </label>
              <div><button type="submit" className="btn btn-primary">Upload</button></div>
            </form>
          </div>
        </div>
      )}

      <div className="section-title"><h2>Files</h2></div>
      <div className="table-wrap">
        <table><thead><tr><th>File</th><th>Folder</th><th>Size</th><th>Uploaded</th><th></th></tr></thead>
          <tbody>
            {files.length === 0 && <tr><td colSpan="5" className="empty">No files yet.</td></tr>}
            {files.map((f) => {
              const path = isAdmin ? folderPathById(folders, f.folderId) : (f.folderPath || '(root)');
              return (
                <tr key={f.id}>
                  <td className="cell-name">{f.filename}</td>
                  <td>{path}</td>
                  <td className="tabular">{fmtBytes(f.sizeBytes)}</td>
                  <td>{fmtDate(new Date(f.uploadedAt))}</td>
                  <td className="row-actions">
                    <button className="btn btn-secondary btn-sm" data-download-file={f.id} onClick={() => downloadFile(auth.token, f, showToast)}>Download</button>
                    {isAdmin && (
                      <>
                        <button className="btn btn-secondary btn-sm" data-manage-access={f.id} onClick={() => setAccessModalFile(f)}>Manage access</button>
                        <button className="btn btn-danger btn-sm" data-delete-file={f.id} onClick={() => deleteFile(f.id)}>{confirmDeleteFile === f.id ? 'Click again to confirm' : 'Delete'}</button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
