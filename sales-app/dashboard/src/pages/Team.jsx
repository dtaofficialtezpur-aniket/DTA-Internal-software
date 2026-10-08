import { useCallback, useEffect, useState } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { STATES } from '../constants.js';
import { ago, fmtDateTime } from '../utils.js';
import { Modal } from '../components/Bits.jsx';

export default function Team({ onOpen }){
  const { call, showToast } = useApp();
  const [team, setTeam] = useState([]);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null);
  const [f, setF] = useState({ fullName: '', username: '', state: '' });
  const [code, setCode] = useState(null); // { username, setupCode }

  const load = useCallback(() => { call('listTeam').then((d) => setTeam(d.team)).catch((e) => showToast(e.message, 'err')); }, [call, showToast]);
  useEffect(load, [load]);

  function create(e){
    e.preventDefault();
    call('createEmployee', f).then((d) => { setAdding(false); setF({ fullName: '', username: '', state: '' }); setCode(d); load(); }).catch((err) => showToast(err.message, 'err'));
  }
  function saveEdit(e){
    e.preventDefault();
    call('updateEmployee', { userId: editing.id, fullName: editing.fullName, state: editing.state }).then(() => { setEditing(null); load(); }).catch((err) => showToast(err.message, 'err'));
  }
  const resetPin = (t) => confirm(`Reset ${t.fullName}'s PIN? They'll be logged out and need a new setup code.`) &&
    call('resetEmployeePin', { userId: t.id }).then((d) => { setCode({ username: t.username, setupCode: d.setupCode }); load(); }).catch((e) => showToast(e.message, 'err'));
  const remove = (t) => confirm(`Remove ${t.fullName}? They lose access immediately. Their leads and history stay visible to you.`) &&
    call('removeEmployee', { userId: t.id }).then(() => { showToast('Access removed.'); load(); }).catch((e) => showToast(e.message, 'err'));

  return (
    <div className="page">
      <header className="page-head"><h1>Sales team</h1><button className="btn primary" onClick={() => setAdding(true)}>+ Add employee</button></header>
      <div className="card table-wrap">
        <table className="table">
          <thead><tr><th>Employee</th><th>Username</th><th>State</th><th>Status</th><th>Last login</th><th>Last active</th><th /></tr></thead>
          <tbody>
            {team.map((t) => (
              <tr key={t.id} className={t.status !== 'active' ? 'dim' : ''}>
                <td><b>{t.fullName}</b></td><td className="mono">{t.username}</td><td>{t.state}</td>
                <td>{t.status !== 'active' ? 'Removed' : t.awaitingPin ? <span className="pill warn">Awaiting PIN setup</span> : <span className="pill good">Active</span>}</td>
                <td>{fmtDateTime(t.lastLoginAt)}</td><td>{ago(t.lastActiveAt)}</td>
                <td className="num actions-cell">
                  <button className="link" onClick={() => onOpen('leads', t.id)}>Leads</button>
                  <button className="link" onClick={() => onOpen('activity', t.id)}>Activity</button>
                  {t.status === 'active' && <>
                    <button className="link" onClick={() => setEditing({ ...t })}>Edit</button>
                    <button className="link" onClick={() => resetPin(t)}>Reset PIN</button>
                    <button className="link danger" onClick={() => remove(t)}>Remove</button></>}
                </td>
              </tr>
            ))}
            {!team.length && <tr><td colSpan="7" className="muted">No employees yet. Add one per state to get started.</td></tr>}
          </tbody>
        </table>
      </div>

      {adding && (
        <Modal title="Add sales employee" onClose={() => setAdding(false)}>
          <form className="form-grid" onSubmit={create}>
            <label className="span2">Full name<input required value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} /></label>
            <label>Username<input required autoCapitalize="none" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} /></label>
            <label>State<select required value={f.state} onChange={(e) => setF({ ...f, state: e.target.value })}><option value="">Select…</option>{STATES.map((s) => <option key={s}>{s}</option>)}</select></label>
            <div className="span2 actions"><button type="button" className="btn ghost" onClick={() => setAdding(false)}>Cancel</button><button className="btn primary">Create</button></div>
          </form>
        </Modal>
      )}
      {editing && (
        <Modal title={'Edit ' + editing.username} onClose={() => setEditing(null)}>
          <form className="form-grid" onSubmit={saveEdit}>
            <label className="span2">Full name<input required value={editing.fullName} onChange={(e) => setEditing({ ...editing, fullName: e.target.value })} /></label>
            <label className="span2">State<select required value={editing.state || ''} onChange={(e) => setEditing({ ...editing, state: e.target.value })}>{STATES.map((s) => <option key={s}>{s}</option>)}</select></label>
            <div className="span2 actions"><button type="button" className="btn ghost" onClick={() => setEditing(null)}>Cancel</button><button className="btn primary">Save</button></div>
          </form>
        </Modal>
      )}
      {code && (
        <Modal title="Share this with the employee" onClose={() => setCode(null)}>
          <p>Username <b className="mono">{code.username}</b></p>
          <p className="setup-code mono">{code.setupCode}</p>
          <p className="muted">On first launch they tap <b>“First time? Set your PIN”</b>, enter their username and this one-time code, and choose a 6-digit PIN. <b>This code is shown only once.</b></p>
          <div className="actions"><button className="btn primary" onClick={() => setCode(null)}>Done</button></div>
        </Modal>
      )}
    </div>
  );
}
