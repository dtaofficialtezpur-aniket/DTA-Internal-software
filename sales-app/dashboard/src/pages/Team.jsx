import { useCallback, useEffect, useState } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { STATES } from '../constants.js';
import { ago, fmtDateTime } from '../utils.js';
import { Modal } from '../components/Bits.jsx';
import { downloadBackup } from '../backup.js';

// Easy-to-read password: no 0/O, 1/l/I. 12 chars from a secure random source.
function generatePassword(){
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const buf = new Uint32Array(12);
  crypto.getRandomValues(buf);
  return Array.from(buf, (n) => chars[n % chars.length]).join('');
}

const STATUS = { active: ['Active', 'good'], locked: ['Locked', 'crit'], removed: ['Removed', ''] };

export default function Team({ onOpen }){
  const { call, showToast } = useApp();
  const [team, setTeam] = useState([]);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null);
  const [pwFor, setPwFor] = useState(null);
  const [f, setF] = useState({ fullName: '', username: '', state: '', password: '' });
  const [creds, setCreds] = useState(null); // { username, password } shown once, to hand to the employee
  const [exporting, setExporting] = useState(false);

  const load = useCallback(() => { call('listTeam').then((d) => setTeam(d.team)).catch((e) => showToast(e.message, 'err')); }, [call, showToast]);
  useEffect(load, [load]);
  useEffect(() => { const id = setInterval(load, 30000); return () => clearInterval(id); }, [load]); // keep Online / Offline fresh

  const openAdd = () => { setF({ fullName: '', username: '', state: '', password: generatePassword() }); setAdding(true); };
  function create(e){
    e.preventDefault();
    call('createEmployee', f).then((d) => { setAdding(false); setCreds({ username: d.username, password: f.password, fullName: f.fullName }); load(); }).catch((err) => showToast(err.message, 'err'));
  }
  function saveEdit(e){
    e.preventDefault();
    call('updateEmployee', { userId: editing.id, fullName: editing.fullName, state: editing.state }).then(() => { setEditing(null); load(); }).catch((err) => showToast(err.message, 'err'));
  }
  function savePassword(e){
    e.preventDefault();
    call('setEmployeePassword', { userId: pwFor.id, password: pwFor.password }).then(() => { setCreds({ username: pwFor.username, password: pwFor.password, fullName: pwFor.fullName }); setPwFor(null); load(); }).catch((err) => showToast(err.message, 'err'));
  }
  const lock = (t) => confirm(`Lock ${t.fullName}? They are logged out right away and cannot log in until you unlock them. Their data is kept.`) &&
    call('lockEmployee', { userId: t.id }).then(() => { showToast(`${t.fullName} is locked.`); load(); }).catch((e) => showToast(e.message, 'err'));
  const unlock = (t) => call('unlockEmployee', { userId: t.id }).then(() => { showToast(`${t.fullName} can log in again.`); load(); }).catch((e) => showToast(e.message, 'err'));
  const remove = (t) => confirm(`Remove ${t.fullName} permanently? They lose access for good. Their leads and history stay visible to you. (To block someone temporarily, use Lock instead.)`) &&
    call('removeEmployee', { userId: t.id }).then(() => { showToast('Employee removed.'); load(); }).catch((e) => showToast(e.message, 'err'));
  const backup = (kind) => {
    setExporting(true);
    call('exportAll').then((d) => { downloadBackup(kind, d); showToast('Backup downloaded.'); }).catch((e) => showToast(e.message, 'err')).finally(() => setExporting(false));
  };
  const copy = (text) => navigator.clipboard?.writeText(text).then(() => showToast('Copied.')).catch(() => {});

  const pwField = (value, onChange) => (
    <label className="span2">Password (at least 8 characters)
      <div className="row-gap"><input required minLength={8} maxLength={64} className="mono" autoComplete="off" value={value} onChange={onChange} />
        <button type="button" className="btn" onClick={() => onChange({ target: { value: generatePassword() } })}>Generate</button></div>
    </label>);

  return (
    <div className="page">
      <header className="page-head"><h1>Sales team</h1><button className="btn primary" onClick={openAdd}>+ Create employee login</button></header>
      <p className="muted" style={{ margin: 0 }}>Only you can create logins. Give each employee their login ID and password; use <b>Lock</b> to block someone instantly and <b>Unlock</b> to let them back in.</p>
      <div className="card table-wrap">
        <table className="table">
          <thead><tr><th>Employee</th><th>Login ID</th><th>State</th><th>Online</th><th>Access</th><th>Last login</th><th>Last seen</th><th /></tr></thead>
          <tbody>
            {team.map((t) => {
              const [label, tone] = STATUS[t.status] || [t.status, ''];
              return (
                <tr key={t.id} className={t.status === 'removed' ? 'dim' : ''}>
                  <td><b>{t.fullName}</b></td><td className="mono">{t.username}</td><td>{t.state}</td>
                  <td>{t.status === 'active' ? <span className={'presence ' + (t.online ? 'on' : 'off')}>{t.online ? 'Online' : 'Offline'}</span> : <span className="muted">—</span>}</td>
                  <td><span className={'pill ' + tone}>{label}</span>{t.status === 'locked' && t.lockedAt && <div className="muted small">since {fmtDateTime(t.lockedAt)}</div>}</td>
                  <td>{fmtDateTime(t.lastLoginAt)}</td><td>{t.online ? 'now' : ago(t.lastActiveAt)}</td>
                  <td className="num actions-cell">
                    <button className="link" onClick={() => onOpen('leads', t.id)}>Leads</button>
                    <button className="link" onClick={() => onOpen('activity', t.id)}>Activity</button>
                    {t.status !== 'removed' && <>
                      <button className="link" onClick={() => setEditing({ ...t })}>Edit</button>
                      <button className="link" onClick={() => setPwFor({ ...t, password: generatePassword() })}>Set password</button>
                      {t.status === 'active' ? <button className="link danger" onClick={() => lock(t)}>Lock</button> : <button className="link" onClick={() => unlock(t)}><b>Unlock</b></button>}
                      <button className="link danger" onClick={() => remove(t)}>Remove</button></>}
                  </td>
                </tr>);
            })}
            {!team.length && <tr><td colSpan="8" className="muted">No employees yet. Create one login per salesperson to get started.</td></tr>}
          </tbody>
        </table>
      </div>

      <section className="card">
        <h3>Backup to this computer</h3>
        <p className="muted">Downloads a copy of all sales data to your computer. CSV files open in Excel; the full backup (JSON) holds everything in one file. Passwords are never included.</p>
        <div className="filters">
          <button className="btn" disabled={exporting} onClick={() => backup('leads')}>Leads (CSV)</button>
          <button className="btn" disabled={exporting} onClick={() => backup('activities')}>Activity (CSV)</button>
          <button className="btn" disabled={exporting} onClick={() => backup('demos')}>Demo requests (CSV)</button>
          <button className="btn" disabled={exporting} onClick={() => backup('employees')}>Employees (CSV)</button>
          <button className="btn primary" disabled={exporting} onClick={() => backup('full')}>Full backup (JSON)</button>
        </div>
      </section>

      {adding && (
        <Modal title="Create employee login" onClose={() => setAdding(false)}>
          <form className="form-grid" onSubmit={create}>
            <label className="span2">Full name<input required value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} /></label>
            <label>Login ID<input required autoCapitalize="none" autoComplete="off" placeholder="e.g. ravi.assam" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} /></label>
            <label>State<select required value={f.state} onChange={(e) => setF({ ...f, state: e.target.value })}><option value="">Select…</option>{STATES.map((s) => <option key={s}>{s}</option>)}</select></label>
            {pwField(f.password, (e) => setF({ ...f, password: e.target.value }))}
            <div className="span2 actions"><button type="button" className="btn ghost" onClick={() => setAdding(false)}>Cancel</button><button className="btn primary">Create login</button></div>
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
      {pwFor && (
        <Modal title={`Set a new password for ${pwFor.fullName}`} onClose={() => setPwFor(null)}>
          <form className="form-grid" onSubmit={savePassword}>
            {pwField(pwFor.password, (e) => setPwFor({ ...pwFor, password: e.target.value }))}
            <p className="span2 muted small" style={{ margin: 0 }}>Their old password stops working and they are logged out.</p>
            <div className="span2 actions"><button type="button" className="btn ghost" onClick={() => setPwFor(null)}>Cancel</button><button className="btn primary">Save password</button></div>
          </form>
        </Modal>
      )}
      {creds && (
        <Modal title="Login details — give these to the employee" onClose={() => setCreds(null)}>
          <dl className="kv">
            <dt>Employee</dt><dd>{creds.fullName}</dd>
            <dt>Login ID</dt><dd className="mono">{creds.username}</dd>
            <dt>Password</dt><dd className="mono">{creds.password}</dd>
          </dl>
          <p className="muted small">This password is shown <b>only now</b> — it is stored scrambled and cannot be looked up later. If it is lost, use <b>Set password</b> to make a new one.</p>
          <div className="actions"><button className="btn" onClick={() => copy(`Login ID: ${creds.username}\nPassword: ${creds.password}`)}>Copy both</button><button className="btn primary" onClick={() => setCreds(null)}>Done</button></div>
        </Modal>
      )}
    </div>
  );
}
