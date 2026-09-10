import { useEffect, useState } from 'react';
import { useApp } from '../state/AppContext.jsx';

export default function ManageAccessModal(){
  const { accessModalFile, setAccessModalFile, call, setFiles, showToast } = useApp();
  const [employees, setEmployees] = useState([]);
  const [checked, setChecked] = useState({});

  useEffect(() => {
    if (!accessModalFile) return;
    call('listTeam').then((data) => {
      setEmployees(data.users.filter((u) => u.role === 'employee' && u.status === 'active'));
      const initial = {};
      (accessModalFile.accessUserIds || []).forEach((id) => { initial[id] = true; });
      setChecked(initial);
    }).catch((err) => showToast('Could not load team: ' + err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessModalFile]);

  if (!accessModalFile) return <div className="modal-wrap"><div className="modal" /></div>;

  function toggle(id){
    setChecked((c) => ({ ...c, [id]: !c[id] }));
  }

  function save(){
    const userIds = Object.keys(checked).filter((id) => checked[id]).map(Number);
    call('setFileAccess', { fileId: accessModalFile.id, userIds }).then(() => {
      showToast('Access updated');
      setAccessModalFile(null);
      return call('listFiles').then((data) => setFiles(data.files));
    }).catch((err) => showToast('Failed: ' + err.message));
  }

  return (
    <div className="modal-wrap open">
      <div className="modal">
        <h2 style={{fontSize:'1.15rem'}}>Manage access — {accessModalFile.filename}</h2>
        <div className="page-sub">Choose which employees can see and download this file.</div>
        <div style={{display:'flex', flexDirection:'column', gap:'8px', marginTop:'14px', maxHeight:'300px', overflowY:'auto'}}>
          {employees.length === 0 && <div className="empty">No employees yet.</div>}
          {employees.map((u) => (
            <label key={u.id} style={{display:'flex', alignItems:'center', gap:'8px', fontSize:'.85rem'}}>
              <input type="checkbox" checked={!!checked[u.id]} onChange={() => toggle(u.id)} />
              {u.fullName} ({u.username})
            </label>
          ))}
        </div>
        <div style={{display:'flex', justifyContent:'flex-end', gap:'8px', marginTop:'18px'}}>
          <button id="access-cancel" type="button" className="btn btn-ghost" onClick={() => setAccessModalFile(null)}>Cancel</button>
          <button id="access-save" type="button" className="btn btn-primary" onClick={save}>Save access</button>
        </div>
      </div>
    </div>
  );
}
