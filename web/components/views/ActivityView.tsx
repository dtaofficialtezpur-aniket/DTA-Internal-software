import { actionColor } from '@/lib/status';
import { timeAgo } from '@/lib/format';
import type { HistoryEvent } from '@/lib/types';

type ActivityEvent = HistoryEvent & { client: string; software: string; t: Date };

export function ActivityView({ connectedToBackend, events }: { connectedToBackend: boolean; events: ActivityEvent[] }) {
  return (
    <section>
      <div className="page-head">
        <div>
          <h1>Activity log</h1>
          <div className="page-sub">Every onboarding, payment, pause and resume event, across all clients.</div>
        </div>
      </div>
      <div className="card" style={{ padding: '6px 16px' }}>
        <div className="log-list">
          {events.length === 0 ? (
            <div className="empty">{connectedToBackend ? 'No activity yet.' : 'Connect a backend in Settings to load activity.'}</div>
          ) : (
            events.map((e, i) => (
              <div className="log-row" key={i}>
                <div className="log-dot" style={{ background: actionColor(e.action) }} />
                <div>
                  <div className="log-text">
                    <b>{e.client}</b> — {e.note}
                  </div>
                  <div className="log-time">
                    {e.software} · {timeAgo(e.t)}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
