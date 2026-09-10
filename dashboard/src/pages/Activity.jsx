import { useApp } from '../state/AppContext.jsx';
import { actionColor, timeAgo } from '../utils.js';

export default function Activity(){
  const { clients } = useApp();
  const events = [];
  clients.forEach((c) => {
    c.history.forEach((h) => events.push({ ...h, client: c.client, software: c.software }));
  });
  events.sort((a, b) => b.t - a.t);

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>Activity log</h1>
          <div className="page-sub">Every onboarding, payment, pause and resume event, across all clients.</div>
        </div>
      </div>
      <div className="card" style={{padding:'6px 16px'}}>
        <div className="log-list">
          {events.length === 0 && <div className="empty">No activity yet.</div>}
          {events.map((e, i) => (
            <div className="log-row" key={i}>
              <div className="log-dot" style={{background: actionColor(e.action)}} />
              <div>
                <div className="log-text"><b>{e.client}</b> — {e.note}</div>
                <div className="log-time">{e.software} · {timeAgo(e.t)}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
