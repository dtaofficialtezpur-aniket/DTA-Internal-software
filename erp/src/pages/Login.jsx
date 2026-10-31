import { useState } from 'react';
import { useStore } from '../lib/store.jsx';
import { Icon } from '../components/ui.jsx';

export default function Login() {
  const { db, login, update } = useStore();
  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');
  const [step, setStep] = useState('user');
  const [err, setErr] = useState('');
  const [shake, setShake] = useState(false);

  const press = async (d) => {
    setErr('');
    const next = (pin + d).slice(0, 4);
    setPin(next);
    if (next.length === 4) {
      if (!(await login(username, next))) {
        update(() => {}, ['Failed login', 'Session', `Username "${username}"`]);
        setErr('Incorrect username or PIN.');
        setShake(true);
        setTimeout(() => { setShake(false); setPin(''); }, 450);
      }
    }
  };

  return (
    <div className="login">
      <section className="login-art">
        <svg className="lines" viewBox="0 0 800 600" preserveAspectRatio="none" aria-hidden="true">
          {[...Array(9)].map((_, i) => (
            <path key={i} d={`M-50 ${80 + i * 60} C 200 ${20 + i * 60}, 400 ${160 + i * 60}, 900 ${60 + i * 60}`} stroke="#c9d4e8" strokeWidth="1.2" fill="none" style={{ animationDelay: `${i * 120}ms` }} />
          ))}
        </svg>
        <div className="row wrap" style={{ gap: 12 }}>
          <div className="kicker">Enterprise Resource Planning</div>
          <span className="demo-pill">Demo version</span>
        </div>
        <div>
          <h1>{db.company.name}</h1>
          <p style={{ color: '#b9c6de', marginTop: 12, maxWidth: 440, fontSize: 15 }}>{db.company.tagline}</p>
          <p style={{ color: '#8fa0bf', marginTop: 6 }}>{db.company.address}</p>
        </div>
        <div className="foot">
          <div>Sales · CRM · Inventory · Purchase · HR &amp; Payroll · Accounts · Audit</div>
          <div className="dta-credit">Demo designed &amp; developed by <b>DTA</b></div>
        </div>
      </section>
      <section className="login-form">
        <div className="login-box page">
          <div className="demo-banner"><Icon name="info" /><div><b>Demo made by DTA</b> for Shanti Trading Company. Sample data only; new entries are limited to <b>2 per feature</b> (bills, customers, products, orders…).</div></div>
          <h2 style={{ fontSize: 22 }}>Sign in</h2>
          <p className="muted" style={{ marginTop: 4 }}>{step === 'user' ? 'Enter your username to continue.' : `Enter the 4-digit PIN for ${username}.`}</p>
          {step === 'user' ? (
            <form className="grid" style={{ marginTop: 22 }} onSubmit={(e) => { e.preventDefault(); if (username.trim()) setStep('pin'); }}>
              <label className="field"><span>Username</span>
                <input className="input" style={{ height: 44 }} value={username} autoFocus autoComplete="username" onChange={(e) => setUsername(e.target.value)} />
              </label>
              <button className="btn primary lg block" disabled={!username.trim()}>Continue</button>
            </form>
          ) : (
            <div className={shake ? 'shake' : ''}>
              <div className="pin-dots">{[0, 1, 2, 3].map((i) => <i key={i} className={pin.length > i ? 'on' : ''} />)}</div>
              <input className="input" type="password" inputMode="numeric" autoFocus value={pin} aria-label="PIN" maxLength={4}
                style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }}
                onChange={(e) => { const v = e.target.value.replace(/\D/g, ''); if (v.length > pin.length) press(v.slice(-1)); else setPin(v); }} />
              <div className="keypad">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => <button key={d} className="key" onClick={() => press(d)}>{d}</button>)}
                <button className="key" onClick={() => { setStep('user'); setPin(''); }} aria-label="Back" style={{ fontSize: 13 }}>Back</button>
                <button className="key" onClick={() => press('0')}>0</button>
                <button className="key" onClick={() => setPin(pin.slice(0, -1))} aria-label="Delete" style={{ fontSize: 13 }}>Del</button>
              </div>
            </div>
          )}
          {err && <div className="alert bad mt"><Icon name="x" />{err}</div>}
          <div className="alert info mt small"><Icon name="info" /><div>Demo accounts: <b>abhimanyu</b> (Owner) 1111 · <b>salesmgr</b> 2222 · <b>cashier</b> 3333 · <b>godown</b> 4444 · <b>accounts</b> 5555. Change PINs under Users &amp; Roles before go-live.</div></div>
        </div>
      </section>
    </div>
  );
}
