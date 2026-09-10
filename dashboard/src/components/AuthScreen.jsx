import { useState } from 'react';
import { useApp } from '../state/AppContext.jsx';

const BrandMark = () => (
  <div className="brand-mark" aria-hidden="true">
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="3" y="2" width="3.4" height="12" rx="1.6" fill="var(--accent-ink)"/><rect x="9.6" y="2" width="3.4" height="12" rx="1.6" fill="var(--accent-ink)"/></svg>
  </div>
);

export default function AuthScreen(){
  const { call, login, showToast } = useApp();
  const [panel, setPanel] = useState('login');
  const [pendingSetPinUsername, setPendingSetPinUsername] = useState(null);
  const [setpinReason, setSetpinReason] = useState('');

  return (
    <div className="auth-shell">
      <div className="card auth-card">
        <div className="auth-brand">
          <BrandMark />
          <div>
            <div className="brand-name">DTA</div>
            <div className="brand-sub">Subscription Control</div>
          </div>
        </div>

        {panel === 'login' && (
          <LoginPanel
            call={call} login={login}
            onNeedsPinSetup={(username) => { setPendingSetPinUsername(username); setSetpinReason('Your PIN was reset. Choose a new one to finish logging in.'); setPanel('setpin'); }}
            onSwitch={setPanel}
          />
        )}
        {panel === 'register' && <RegisterPanel call={call} login={login} onSwitch={setPanel} />}
        {panel === 'forgot' && <ForgotPanel call={call} showToast={showToast} onSwitch={setPanel} />}
        {panel === 'setpin' && (
          <SetPinPanel
            call={call} login={login}
            username={pendingSetPinUsername}
            reason={setpinReason}
          />
        )}
      </div>
    </div>
  );
}

function LoginPanel({ call, login, onNeedsPinSetup, onSwitch }){
  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');

  function submit(e){
    e.preventDefault();
    setError('');
    call('login', { username: username.trim(), pin: pin.trim() }).then((data) => {
      if (data.needsPinSetup){ onNeedsPinSetup(data.username); return; }
      login(data.token, data.user);
    }).catch((err) => setError(err.message));
  }

  return (
    <div>
      <h2 style={{fontSize:'1.1rem', marginBottom:'16px'}}>Log in</h2>
      <form className="settings-form" id="login-form" onSubmit={submit}>
        <label>Username
          <input id="login-username" type="text" required autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} />
        </label>
        <label>6-digit PIN
          <input id="login-pin" type="password" inputMode="numeric" pattern="\d{6}" maxLength={6} className="pin-input" required autoComplete="current-password" value={pin} onChange={(e) => setPin(e.target.value)} />
        </label>
        {error && <div className="auth-error" id="login-error">{error}</div>}
        <button type="submit" className="btn btn-primary btn-block">Log in</button>
      </form>
      <div className="auth-switch">
        New here? <button type="button" data-auth-switch="register" onClick={() => onSwitch('register')}>Register</button>
        &nbsp;·&nbsp;
        <button type="button" data-auth-switch="forgot" onClick={() => onSwitch('forgot')}>Forgot PIN?</button>
      </div>
    </div>
  );
}

function RegisterPanel({ call, login, onSwitch }){
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');

  function submit(e){
    e.preventDefault();
    setError('');
    call('register', { fullName: fullName.trim(), username: username.trim(), pin: pin.trim() }).then((data) => {
      if (data.status === 'active'){
        login(data.token, data.user);
      } else {
        onSwitch('login');
      }
    }).catch((err) => setError(err.message));
  }

  return (
    <div>
      <h2 style={{fontSize:'1.1rem', marginBottom:'4px'}}>First-time setup</h2>
      <div className="page-sub" style={{marginBottom:'16px'}}>This creates the admin account and only works once — the very first account in the system. If you're an employee, ask your admin to create your account instead, and just log in below.</div>
      <form className="settings-form" id="register-form" onSubmit={submit}>
        <label>Full name
          <input id="register-fullname" type="text" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </label>
        <label>Username
          <input id="register-username" type="text" required pattern="[a-zA-Z0-9_.\-]+" title="Letters, numbers, . _ - only" value={username} onChange={(e) => setUsername(e.target.value)} />
        </label>
        <label>Choose a 6-digit PIN
          <input id="register-pin" type="password" inputMode="numeric" pattern="\d{6}" maxLength={6} className="pin-input" required autoComplete="new-password" value={pin} onChange={(e) => setPin(e.target.value)} />
        </label>
        {error && <div className="auth-error" id="register-error">{error}</div>}
        <button type="submit" className="btn btn-primary btn-block">Register</button>
      </form>
      <div className="auth-switch">Already have an account? <button type="button" data-auth-switch="login" onClick={() => onSwitch('login')}>Log in</button></div>
    </div>
  );
}

function ForgotPanel({ call, showToast, onSwitch }){
  const [username, setUsername] = useState('');

  function submit(e){
    e.preventDefault();
    call('requestPinReset', { username: username.trim() }).then((data) => {
      showToast(data.message || 'Reset requested.');
      onSwitch('login');
    }).catch((err) => showToast('Failed: ' + err.message));
  }

  return (
    <div>
      <h2 style={{fontSize:'1.1rem', marginBottom:'4px'}}>Forgot PIN</h2>
      <div className="page-sub" style={{marginBottom:'16px'}}>Your admin needs to approve this before you can set a new PIN.</div>
      <form className="settings-form" id="forgot-form" onSubmit={submit}>
        <label>Username
          <input id="forgot-username" type="text" required value={username} onChange={(e) => setUsername(e.target.value)} />
        </label>
        <button type="submit" className="btn btn-primary btn-block">Request reset</button>
      </form>
      <div className="auth-switch"><button type="button" data-auth-switch="login" onClick={() => onSwitch('login')}>Back to log in</button></div>
    </div>
  );
}

function SetPinPanel({ call, login, username, reason }){
  const [newPin, setNewPin] = useState('');
  const [error, setError] = useState('');

  function submit(e){
    e.preventDefault();
    setError('');
    call('setPin', { username, newPin: newPin.trim() }).then((data) => {
      login(data.token, data.user);
    }).catch((err) => setError(err.message));
  }

  return (
    <div>
      <h2 style={{fontSize:'1.1rem', marginBottom:'4px'}}>Set a new PIN</h2>
      <div className="page-sub" style={{marginBottom:'16px'}}>{reason}</div>
      <form className="settings-form" id="setpin-form" onSubmit={submit}>
        <label>New 6-digit PIN
          <input id="setpin-pin" type="password" inputMode="numeric" pattern="\d{6}" maxLength={6} className="pin-input" required autoComplete="new-password" value={newPin} onChange={(e) => setNewPin(e.target.value)} />
        </label>
        {error && <div className="auth-error" id="setpin-error">{error}</div>}
        <button type="submit" className="btn btn-primary btn-block">Set PIN &amp; log in</button>
      </form>
    </div>
  );
}
