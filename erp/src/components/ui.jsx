import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { DEMO_KINDS, DEMO_LIMIT, useStore } from '../lib/store.jsx';
import { money } from '../lib/format.js';

const PATHS = {
  dashboard: 'M3 13h8V3H3zM13 21h8V11h-8zM3 21h8v-6H3zM13 3v6h8V3z',
  pos: 'M3 4h18v12H3zM8 20h8M12 16v4M7 8h4M7 11h7',
  invoice: 'M6 2h9l5 5v15H6zM14 2v6h6M9 13h7M9 17h7M9 9h2',
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  wallet: 'M20 7H5a2 2 0 0 1 0-4h13v4M3 5v14a2 2 0 0 0 2 2h15V7M16 14h.01',
  tag: 'M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8zM7 7h.01',
  box: 'M21 8 12 3 3 8v8l9 5 9-5zM3 8l9 5 9-5M12 13v8',
  layers: 'M12 2 2 7l10 5 10-5zM2 17l10 5 10-5M2 12l10 5 10-5',
  truck: 'M1 3h14v13H1zM15 8h4l3 3v5h-7M5.5 21a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5M18.5 21a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5',
  cart: 'M9 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2M20 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6',
  chart: 'M3 3v18h18M7 15l4-4 3 3 6-6',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10M9 12l2 2 4-4',
  history: 'M3 3v5h5M3.05 13A9 9 0 1 0 6 5.3L3 8M12 7v5l4 2',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z',
  user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8',
  plus: 'M12 5v14M5 12h14',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16M21 21l-4.35-4.35',
  x: 'M18 6 6 18M6 6l12 12',
  check: 'M20 6 9 17l-5-5',
  alert: 'M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0M12 9v4M12 17h.01',
  info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20M12 16v-4M12 8h.01',
  print: 'M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z',
  trash: 'M3 6h18M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6M9 6V4h6v2',
  edit: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  menu: 'M3 12h18M3 6h18M3 18h18',
  whatsapp: 'M21 11.5a8.4 8.4 0 0 1-12.4 7.4L3 21l2.1-5.4A8.4 8.4 0 1 1 21 11.5z',
  download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
  scale: 'M12 3v18M5 7h14M5 7l-3 7a3 3 0 0 0 6 0zM19 7l-3 7a3 3 0 0 0 6 0zM8 21h8',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20M12 6v6l4 2',
  lock: 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4',
  bank: 'M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M20 10v11M8 14v3M12 14v3M16 14v3',
  briefcase: 'M2 7h20v14H2zM16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16',
  target: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4',
  gift: 'M20 12v10H4V12M2 7h20v5H2zM12 22V7M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z',
  scan: 'M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 12h10',
  arrowUp: 'M7 17 17 7M7 7h10v10',
  refresh: 'M23 4v6h-6M1 20v-6h6M3.5 9a9 9 0 0 1 14.9-3.4L23 10M1 14l4.6 4.4A9 9 0 0 0 20.5 15',
};

export function Icon({ name, ...rest }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
      <path d={PATHS[name] || PATHS.info} />
    </svg>
  );
}

// Eases a number from its previous value to the new one.
export function CountUp({ value, format = (v) => Math.round(v).toLocaleString('en-IN'), duration = 900 }) {
  const [shown, setShown] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    const start = performance.now();
    const a = from.current, b = Number(value) || 0;
    let raf;
    const step = (t) => {
      const k = Math.min(1, (t - start) / duration);
      const e = 1 - Math.pow(1 - k, 3);
      setShown(a + (b - a) * e);
      if (k < 1) raf = requestAnimationFrame(step); else from.current = b;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return <>{format(shown)}</>;
}

export const Money = ({ value }) => <CountUp value={value} format={money} />;

export function Stat({ label, value, sub, icon, tone = '', money: isMoney = true }) {
  return (
    <div className={`card stat hover ${tone}`}>
      <div className="ic"><Icon name={icon} /></div>
      <div className="label">{label}</div>
      <div className="value">{isMoney ? <Money value={value} /> : <CountUp value={value} />}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}

export function PageHead({ title, sub, children }) {
  return (
    <div className="page-head">
      <div><h1>{title}</h1>{sub && <p>{sub}</p>}</div>
      <div className="actions">{children}</div>
    </div>
  );
}

export function Modal({ title, onClose, children, footer, wide }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  // Portal to <body>: animated (transformed) page wrappers would otherwise trap the fixed overlay.
  return createPortal(
    <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head"><h2>{title}</h2><button className="btn ghost icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" /></button></div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function Field({ label, hint, children }) {
  return <label className="field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}

export function Tabs({ value, onChange, items }) {
  return (
    <div className="tabs" role="tablist">
      {items.map(([k, label]) => (
        <button key={k} role="tab" aria-selected={value === k} className={`tab ${value === k ? 'active' : ''}`} onClick={() => onChange(k)}>{label}</button>
      ))}
    </div>
  );
}

export function Empty({ icon = 'box', text }) {
  return <div className="empty"><Icon name={icon} /><div>{text}</div></div>;
}

export function Search({ value, onChange, placeholder = 'Search' }) {
  return (
    <div className="search">
      <Icon name="search" />
      <input className="input" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}

// "Demo · 1 of 2 left" next to an add button.
export function DemoLeft({ kind }) {
  const { demoLeft } = useStore();
  const left = demoLeft(kind);
  return <span className={`demo-left ${left ? '' : 'out'}`} title={`Demo version: ${DEMO_LIMIT} ${DEMO_KINDS[kind]} per login`}><Icon name="lock" />Demo · {left} of {DEMO_LIMIT} {DEMO_KINDS[kind]} left</span>;
}

export function DemoLimitModal() {
  const { limitHit, setLimitHit } = useStore();
  if (!limitHit) return null;
  return (
    <Modal title="Demo limit reached" onClose={() => setLimitHit(null)} footer={<button className="btn primary" onClick={() => setLimitHit(null)}>Understood</button>}>
      <div className="grid" style={{ gap: 14, justifyItems: 'center', textAlign: 'center' }}>
        <span className="mini-ic gold" style={{ width: 56, height: 56, borderRadius: '50%' }}><Icon name="lock" style={{ width: 26, height: 26 }} /></span>
        <div>
          <h2>This is a demo version</h2>
          <p className="muted" style={{ marginTop: 6 }}>The demo allows <b>{DEMO_LIMIT} {DEMO_KINDS[limitHit]}</b> per login, and both have been used.
            Log out and sign in again for 2 more. Editing and viewing existing records still works.</p>
        </div>
        <div className="alert info" style={{ textAlign: 'left' }}><Icon name="info" /><div>For the full version without limits, please contact <b>DTA</b>.</div></div>
      </div>
    </Modal>
  );
}

export function Toasts() {
  const { toasts } = useStore();
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => <div key={t.id} className={`toast ${t.tone}`}><Icon name={t.tone === 'bad' ? 'alert' : 'check'} />{t.text}</div>)}
    </div>
  );
}

// Asks an authorised user for their PIN (discount approval, credit override, purchase approval).
export function ApprovalModal({ title, reason, approvers, needNote, onApproved, onClose }) {
  const { verifyPin } = useStore();
  const [who, setWho] = useState(approvers[0]?.id || '');
  const [pin, setPin] = useState('');
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [shake, setShake] = useState(false);
  const submit = async () => {
    if (needNote && !note.trim()) return setErr('Please record the reason.');
    if (await verifyPin(who, pin)) return onApproved({ by: who, byName: approvers.find((a) => a.id === who)?.name, note: note.trim() });
    setErr('Incorrect PIN.'); setPin(''); setShake(true); setTimeout(() => setShake(false), 450);
  };
  return (
    <Modal title={title} onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>Cancel</button>
      <button className="btn primary" onClick={submit} disabled={!who || pin.length < 4}><Icon name="lock" />Approve</button>
    </>}>
      <div className="alert warn"><Icon name="alert" /><div>{reason}</div></div>
      {!approvers.length ? <p className="mt muted">No active user is authorised to approve this.</p> : (
        <div className={`grid mt ${shake ? 'shake' : ''}`}>
          <Field label="Approved by">
            <select className="input" value={who} onChange={(e) => setWho(e.target.value)}>
              {approvers.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </Field>
          <Field label="Approver PIN">
            <input className="input" type="password" inputMode="numeric" maxLength={6} value={pin} autoFocus
              onChange={(e) => { setPin(e.target.value.replace(/\D/g, '')); setErr(''); }} onKeyDown={(e) => e.key === 'Enter' && submit()} />
          </Field>
          {needNote && <Field label="Reason"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></Field>}
          {err && <div className="alert bad"><Icon name="x" />{err}</div>}
        </div>
      )}
    </Modal>
  );
}

export function Bars({ data, format = money }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="bars">
      {data.map((d, i) => (
        <div className="bar-col" key={d.label + i}>
          <div className={`bar ${d.highlight ? 'today' : ''}`} style={{ height: `${Math.max(2, d.value / max * 100)}%`, animationDelay: `${i * 35}ms` }}>
            <span className="bar-tip">{format(d.value)}</span>
          </div>
          <span className="bar-label">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

export function HBar({ pct, tone = '' }) {
  return <div className={`hbar ${tone}`}><i style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} /></div>;
}
