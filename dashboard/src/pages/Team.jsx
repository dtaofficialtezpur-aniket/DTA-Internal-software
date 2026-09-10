import { useCallback, useEffect, useState } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { TeamStatusPill } from '../components/StatusPill.jsx';

export default function Team(){
  const { call, showToast } = useApp();
  const [users, setUsers] = useState([]);
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [confirmRemoveId, setConfirmRemoveId] = useState(null);

  const load = useCallback(() => {
    call('listTeam').then((data) => setUsers(data.users))
      .catch((err) => showToast('Could not load team: ' + err.message));
  }, [call, showToast]);

  useEffect(() => { load(); }, [load]);

  function addEmployee(e){
    e.preventDefault();
    call('createEmployee', { fullName: fullName.trim(), username: username.trim() }).then(() => {
      showToast(fullName.trim() + ' added — they set their own PIN on first login.');
      setFullName(''); setUsername('');
      load();
    }).catch((err) => showToast('Failed: ' + err.message));
  }

  function approveReset(id){
    call('approvePinReset', { userId: id })
      .then(() => { showToast('PIN reset approved'); load(); })
      .catch((err) => showToast('Failed: ' + err.message));
  }

  function removeUser(id){
    if (confirmRemoveId !== id){ setConfirmRemoveId(id); return; }
    call('removeEmployee', { userId: id })
      .then(() => { showToast('Access removed'); setConfirmRemoveId(null); load(); })
      .catch((err) => showToast('Failed: ' + err.message));
  }

  const resetRequests = users.filter((u) => u.status === 'active' && u.pinResetRequested);

  return (
    <section>
      <div className="page-head"><div>
        <h1>Team</h1>
        <div className="page-sub">Create employee accounts, manage access, and PIN reset requests.</div>
      </div></div>

      <div className="card" style={{padding:'20px 22px', marginBottom:'18px'}}>
        <h2 style={{fontSize:'1rem', marginBottom:'4px'}}>Add employee</h2>
        <div className="page-sub" style={{marginBottom:'14px'}}>Creates their account. They set their own PIN the first time they log in with this username — no password to hand them.</div>
        <form className="settings-form" id="add-employee-form" onSubmit={addEmployee}>
          <label>Full name
            <input id="ae-fullname" type="text" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </label>
          <label>Username
            <input id="ae-username" type="text" required pattern="[a-zA-Z0-9_.\-]+" title="Letters, numbers, . _ - only" value={username} onChange={(e) => setUsername(e.target.value)} />
          </label>
          <div><button type="submit" className="btn btn-primary">Create employee</button></div>
        </form>
      </div>

      <div className="section-title"><h2>PIN reset requests</h2></div>
      <div className="table-wrap">
        <table><thead><tr><th>Name</th><th>Username</th><th></th></tr></thead>
          <tbody>
            {resetRequests.length === 0 && <tr><td colSpan="3" className="empty">No pending PIN reset requests.</td></tr>}
            {resetRequests.map((u) => (
              <tr key={u.id}>
                <td className="cell-name">{u.fullName}</td>
                <td>{u.username}</td>
                <td className="row-actions"><button className="btn btn-secondary btn-sm" data-approve-reset={u.id} onClick={() => approveReset(u.id)}>Approve reset</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="section-title"><h2>Team members</h2></div>
      <div className="table-wrap">
        <table><thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {users.length === 0 && <tr><td colSpan="5" className="empty">No team members yet.</td></tr>}
            {users.map((u) => (
              <tr key={u.id}>
                <td className="cell-name">{u.fullName}</td>
                <td>{u.username}</td>
                <td>{u.role === 'admin' ? 'Admin' : 'Employee'}</td>
                <td><TeamStatusPill status={u.status} /></td>
                <td className="row-actions">
                  {u.role !== 'admin' && u.status === 'active' && (
                    <button className="btn btn-danger btn-sm" data-remove-user={u.id} onClick={() => removeUser(u.id)}>
                      {confirmRemoveId === u.id ? 'Click again to confirm' : 'Remove'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
