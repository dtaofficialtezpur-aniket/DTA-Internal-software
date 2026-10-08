import { useEffect, useState } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { PREVIEW_LOGINS } from '../preview/logins.js';
import logo from '../assets/dta-logo.png';

export default function AuthScreen(){
  const { call, login } = useApp();
  const [panel, setPanel] = useState('login');
  const [adminExists, setAdminExists] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ username: '', pin: '', pin2: '', fullName: '', adminKey: '', setupCode: '' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  useEffect(() => { call('setupStatus').then((d) => setAdminExists(d.adminExists)).catch(() => {}); }, [call]);

  function submit(e){
    e.preventDefault();
    setError('');
    if (panel !== 'login' && f.pin !== f.pin2) { setError('The two PINs do not match.'); return; }
    const req = panel === 'login' ? call('login', { username: f.username, pin: f.pin })
      : panel === 'setpin' ? call('setPin', { username: f.username, setupCode: f.setupCode, pin: f.pin })
      : call('register', { adminKey: f.adminKey, fullName: f.fullName, username: f.username, pin: f.pin });
    setBusy(true);
    req.then((d) => login(d.token, d.user)).catch((err) => { setError(err.message); setBusy(false); });
  }

  const pinInput = (k, label, auto) => (
    <label>{label}
      <input type="password" inputMode="numeric" pattern="\d{6}" maxLength={6} required className="pin-input" autoComplete={auto} value={f[k]} onChange={set(k)} />
    </label>
  );

  const quick = (username) => { setBusy(true); call('login', { username, pin: '' }).then((d) => login(d.token, d.user)); };

  return (
    <div className="auth-shell">
      <form className="card auth-card" onSubmit={submit}>
        <div className="brand" style={{ marginBottom: 18 }}><img src={logo} alt="" width="34" height="34" /><div><div className="brand-name">DTA</div><div className="brand-sub">Sales</div></div></div>
        <h2>{panel === 'login' ? 'Log in' : panel === 'setpin' ? 'Set your PIN' : 'Create the admin account'}</h2>
        {panel === 'setpin' && <p className="muted">Enter the setup code your admin gave you, then choose a 6-digit PIN.</p>}
        {panel === 'register' && <label>Admin key<input type="password" required value={f.adminKey} onChange={set('adminKey')} autoComplete="off" /></label>}
        {panel === 'register' && <label>Your name<input required value={f.fullName} onChange={set('fullName')} /></label>}
        <label>Username<input required autoComplete="username" autoCapitalize="none" value={f.username} onChange={set('username')} /></label>
        {panel === 'setpin' && <label>Setup code<input required className="mono" autoCapitalize="characters" autoComplete="off" value={f.setupCode} onChange={set('setupCode')} /></label>}
        {pinInput('pin', panel === 'login' ? '6-digit PIN' : 'New 6-digit PIN', panel === 'login' ? 'current-password' : 'new-password')}
        {panel !== 'login' && pinInput('pin2', 'Repeat PIN', 'new-password')}
        {error && <div className="form-error" role="alert">{error}</div>}
        <button className="btn primary" disabled={busy}>{busy ? 'Please wait…' : panel === 'login' ? 'Log in' : 'Continue'}</button>
        <div className="auth-links">
          {panel !== 'login' && <button type="button" className="link" onClick={() => { setPanel('login'); setError(''); }}>Back to log in</button>}
          {panel === 'login' && <button type="button" className="link" onClick={() => { setPanel('setpin'); setError(''); }}>First time? Set your PIN</button>}
          {panel === 'login' && !adminExists && <button type="button" className="link" onClick={() => { setPanel('register'); setError(''); }}>Create admin account</button>}
        </div>
      </form>
      {import.meta.env.VITE_PREVIEW && (
        <div className="card auth-card preview-box">
          <strong>Preview mode — sample data, nothing is saved</strong>
          {(PREVIEW_LOGINS).map(([label, u]) => <button key={u} className="btn" onClick={() => quick(u)}>{label}</button>)}
        </div>
      )}
    </div>
  );
}
