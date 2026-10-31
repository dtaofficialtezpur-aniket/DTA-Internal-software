import { useState } from 'react';
import { hashPin, useStore } from '../lib/store.jsx';
import { ROLES, ACCESS } from '../lib/calc.js';
import { uid } from '../lib/format.js';
import { DemoLeft, Field, Icon, Modal, PageHead } from '../components/ui.jsx';
import { TITLES } from '../components/Layout.jsx';

export default function Users() {
  const { db, user } = useStore();
  const [edit, setEdit] = useState(null);
  return (
    <div className="page">
      <PageHead title="Users & Roles" sub="Each person logs in with their own username and 4-digit PIN">
        <DemoLeft kind="user" />
        <button className="btn primary" onClick={() => setEdit({ name: '', username: '', role: 'cashier', active: true, pin: '' })}><Icon name="plus" />Add user</button>
      </PageHead>
      <div className="card"><div className="table-wrap"><table className="t">
        <thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Discount limit</th><th>Can open</th><th>Status</th></tr></thead>
        <tbody>{db.users.map((u) => (
          <tr key={u.id} className="click" onClick={() => setEdit({ ...u, pin: '' })}>
            <td className="strong">{u.name}{u.id === user.id && <span className="badge blue" style={{ marginLeft: 6 }}>You</span>}</td>
            <td className="mono">{u.username}</td><td>{ROLES[u.role]}</td>
            <td>{db.settings.discountTiers.find((t) => t.role === u.role)?.max ?? 0}%</td>
            <td className="small muted" style={{ maxWidth: 320 }}>{ACCESS[u.role] === '*' ? 'Everything' : ACCESS[u.role].map((k) => TITLES[k]).join(', ')}</td>
            <td><span className={`badge ${u.active ? 'ok' : ''}`}>{u.active ? 'Active' : 'Disabled'}</span></td>
          </tr>
        ))}</tbody>
      </table></div></div>
      {edit && <UserForm value={edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function UserForm({ value, onClose }) {
  const { db, user, update, toast, guard } = useStore();
  const [f, setF] = useState(value);
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const save = async () => {
    const username = f.username.trim().toLowerCase();
    if (!f.name.trim() || !username) return setErr('Name and username are required.');
    if (db.users.some((u) => u.username === username && u.id !== f.id)) return setErr('That username is taken.');
    if (!f.id && !/^\d{4}$/.test(f.pin)) return setErr('Set a 4-digit PIN.');
    if (f.pin && !/^\d{4}$/.test(f.pin)) return setErr('PIN must be 4 digits.');
    if (f.id === user.id && (!f.active || f.role !== 'owner')) return setErr('You cannot remove your own owner access.');
    const pinHash = f.pin ? await hashPin(username, f.pin) : null;
    // A changed username invalidates the old PIN hash, so require a new PIN then.
    if (f.id && username !== value.username && !pinHash) return setErr('Set a new PIN when changing the username.');
    const { pin, ...rest } = f;
    if (!f.id && !guard('user')) return;
    update((d) => {
      const rec = { ...rest, name: f.name.trim(), username, ...(pinHash ? { pinHash } : {}) };
      if (f.id) Object.assign(d.users.find((u) => u.id === f.id), rec); else d.users.push({ ...rec, id: uid('u') });
    }, [f.id ? (pin ? 'Reset PIN' : 'Edited user') : 'Added user', 'User', `${f.name} · ${ROLES[f.role]}${f.active ? '' : ' · disabled'}`], f.id ? null : 'user');
    toast('User saved'); onClose();
  };
  return (
    <Modal title={f.id ? 'Edit user' : 'Add user'} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save}>Save</button></>}>
      <div className="grid g2">
        <Field label="Full name"><input className="input" autoFocus value={f.name} onChange={set('name')} /></Field>
        <Field label="Username"><input className="input" value={f.username} onChange={set('username')} autoComplete="off" /></Field>
        <Field label="Role"><select className="input" value={f.role} onChange={set('role')}>{Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        <Field label={f.id ? 'New PIN (leave blank to keep)' : 'PIN'}><input className="input" type="password" inputMode="numeric" maxLength={4} value={f.pin} onChange={(e) => setF({ ...f, pin: e.target.value.replace(/\D/g, '') })} autoComplete="new-password" /></Field>
      </div>
      <label className="row mt"><input type="checkbox" checked={f.active} onChange={set('active')} /> Active (can log in)</label>
      {err && <div className="alert bad mt"><Icon name="x" />{err}</div>}
    </Modal>
  );
}
