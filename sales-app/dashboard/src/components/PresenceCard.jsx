import { useCallback, useEffect, useState } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { ago } from '../utils.js';

// Admin only: who has the app open right now, and when everyone else was last seen. Refreshes every 30 s.
export default function PresenceCard({ onOpenEmployee }){
  const { call } = useApp();
  const [team, setTeam] = useState(null);
  const load = useCallback(() => { call('listTeam').then((d) => setTeam(d.team)).catch(() => {}); }, [call]);
  useEffect(() => { load(); const id = setInterval(load, 30000); return () => clearInterval(id); }, [load]);

  if (!team) return null;
  const live = team.filter((t) => t.status === 'active');
  const online = live.filter((t) => t.online);
  const offline = live.filter((t) => !t.online).sort((a, b) => (b.lastActiveAt || '').localeCompare(a.lastActiveAt || ''));
  const locked = team.filter((t) => t.status === 'locked');

  return (
    <section className="card">
      <div className="split"><h3>Who is online <span className="muted">— {online.length} of {live.length}</span></h3><span className="muted small">updates every 30 seconds</span></div>
      <div className="presence-grid">
        <div>
          <div className="presence-head on">● Online now ({online.length})</div>
          <ul className="plist">{online.map((t) => <li key={t.id}><button className="link" onClick={() => onOpenEmployee(t.id)}>{t.fullName}</button><span className="muted small">{t.state}</span></li>)}
            {!online.length && <li className="muted">Nobody is online right now.</li>}</ul>
        </div>
        <div>
          <div className="presence-head off">○ Offline ({offline.length})</div>
          <ul className="plist">{offline.map((t) => <li key={t.id}><button className="link" onClick={() => onOpenEmployee(t.id)}>{t.fullName}</button><span className="muted small">{t.state} · {t.lastActiveAt ? 'last seen ' + ago(t.lastActiveAt) : 'never logged in'}</span></li>)}
            {!offline.length && <li className="muted">Everyone is online.</li>}</ul>
        </div>
      </div>
      {locked.length > 0 && <p className="muted small" style={{ margin: '12px 0 0' }}>Locked: {locked.map((t) => t.fullName).join(', ')}</p>}
    </section>
  );
}
