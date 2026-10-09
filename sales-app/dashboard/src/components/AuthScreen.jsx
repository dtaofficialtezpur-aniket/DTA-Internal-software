import { useEffect, useState } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { PREVIEW_LOGINS } from '../preview/logins.js';
import Logo from './Logo.jsx';

// Employees cannot create or change their own login -- the admin does that (Sales team page).
// The only sign-up here is the one-time owner account, protected by the admin key from config.php.
export default function AuthScreen(){
  const { call, login } = useApp();
  const [panel, setPanel] = useState('login');
  const [adminExists, setAdminExists] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ username: '', password: '', password2: '', fullName: '', adminKey: '' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  useEffect(() => { call('setupStatus').then((d) => setAdminExists(d.adminExists)).catch(() => {}); }, [call]);

  function submit(e){
    e.preventDefault();
    setError('');
    if (panel === 'register' && f.password !== f.password2) { setError('The two passwords do not match.'); return; }
    const req = panel === 'login' ? call('login', { username: f.username, password: f.password })
      : call('register', { adminKey: f.adminKey, fullName: f.fullName, username: f.username, password: f.password });
    setBusy(true);
    req.then((d) => login(d.token, d.user)).catch((err) => { setError(err.message); setBusy(false); });
  }
  const quick = (username) => { setBusy(true); call('login', { username, password: '' }).then((d) => login(d.token, d.user)).catch((err) => { setError(err.message); setBusy(false); }); };

  return (
    <div className="auth-shell">
      <form className="card auth-card" onSubmit={submit}>
        <div className="auth-logo"><Logo variant="full" width={210} /></div>
        <div className="auth-dept"><div className="auth-dept-name">DTA Sales Team Department</div><div className="auth-dept-scope">Pan India Level</div></div>
        <h2>{panel === 'login' ? 'Log in' : 'Create the admin account'}</h2>
        {panel === 'register' && <label>Admin key<input type="password" required value={f.adminKey} onChange={set('adminKey')} autoComplete="off" /></label>}
        {panel === 'register' && <label>Your name<input required value={f.fullName} onChange={set('fullName')} /></label>}
        <label>Login ID<input required autoComplete="username" autoCapitalize="none" value={f.username} onChange={set('username')} /></label>
        <label>Password<input type="password" required minLength={panel === 'register' ? 8 : undefined} autoComplete={panel === 'login' ? 'current-password' : 'new-password'} value={f.password} onChange={set('password')} /></label>
        {panel === 'register' && <label>Repeat password<input type="password" required autoComplete="new-password" value={f.password2} onChange={set('password2')} /></label>}
        {error && <div className="form-error" role="alert">{error}</div>}
        <button className="btn primary" disabled={busy}>{busy ? 'Please wait…' : panel === 'login' ? 'Log in' : 'Create account'}</button>
        <div className="auth-links">
          {panel === 'login' && <span className="muted small">Your login ID and password are given to you by the DTA admin.</span>}
          {panel === 'register' && <button type="button" className="link" onClick={() => { setPanel('login'); setError(''); }}>Back to log in</button>}
          {panel === 'login' && !adminExists && <button type="button" className="link" onClick={() => { setPanel('register'); setError(''); }}>First-time setup: create admin account</button>}
        </div>
      </form>
      {import.meta.env.VITE_PREVIEW && (
        <div className="card auth-card preview-box">
          <strong>Preview mode — sample data, nothing is saved</strong>
          {(PREVIEW_LOGINS).map(([label, u]) => <button key={u} type="button" className="btn" onClick={() => quick(u)}>{label}</button>)}
        </div>
      )}
    </div>
  );
}
