'use client';

import { Pill } from '@/components/Pill';
import { fmtDate, fmtDateTime, fmtMoney, maskKey } from '@/lib/format';
import { actionColor, computeStatus } from '@/lib/status';
import type { Client } from '@/lib/types';

export function ClientDetailPanel({
  client,
  open,
  leadDays,
  today,
  revealKey,
  onToggleReveal,
  pauseConfirm,
  onClose,
  onCopyKey,
  onRegenerateKey,
  onMarkPaid,
  onPause,
  onResume,
}: {
  client: Client | null;
  open: boolean;
  leadDays: number;
  today: Date;
  revealKey: boolean;
  onToggleReveal: () => void;
  pauseConfirm: boolean;
  onClose: () => void;
  onCopyKey: (key: string) => void;
  onRegenerateKey: (id: string, clientName: string) => void;
  onMarkPaid: (id: string, clientName: string) => void;
  onPause: (id: string, clientName: string) => void;
  onResume: (id: string, clientName: string) => void;
}) {
  return (
    <aside className={'panel' + (open ? ' open' : '')} aria-label="Client detail">
      {client && (
        <>
          <div className="panel-head">
            <div>
              <div style={{ fontSize: '.72rem', color: 'var(--ink-faint)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                {client.id}
              </div>
              <h2 style={{ fontSize: '1.1rem', marginTop: 2 }}>{client.client}</h2>
              <div className="page-sub" style={{ marginTop: 2 }}>
                {client.software}
              </div>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close">
              ✕
            </button>
          </div>
          <div className="panel-body">
            <div>
              <Pill status={computeStatus(client, leadDays, today)} />
            </div>
            <div>
              <div className="field-row">
                <span>Plan</span>
                <span className="tabular">
                  {fmtMoney(client.amount)} / {client.cycle === 'Monthly' ? 'month' : 'year'}
                </span>
              </div>
              <div className="field-row">
                <span>Started</span>
                <span>{fmtDate(new Date(client.start))}</span>
              </div>
              <div className="field-row">
                <span>Next due</span>
                <span>{fmtDate(new Date(client.nextDue))}</span>
              </div>
              <div className="field-row">
                <span>Grace period</span>
                <span>{client.grace} days</span>
              </div>
            </div>
            <div>
              <div style={{ fontSize: '.78rem', fontWeight: 700, color: 'var(--ink-muted)', marginBottom: 6 }}>Client ID</div>
              <div className="key-box">
                <code>{client.id}</code>
              </div>
              <div style={{ fontSize: '.78rem', fontWeight: 700, color: 'var(--ink-muted)', margin: '12px 0 6px' }}>API key</div>
              <div className="key-box">
                <code>{revealKey ? client.apiKey : maskKey(client.apiKey)}</code>
                <button className="btn btn-ghost btn-sm" onClick={onToggleReveal}>
                  {revealKey ? 'Hide' : 'Reveal'}
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => onCopyKey(client.apiKey)}>
                  Copy
                </button>
              </div>
              <button className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={() => onRegenerateKey(client.id, client.client)}>
                Regenerate API key
              </button>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn btn-secondary btn-sm" onClick={() => onMarkPaid(client.id, client.client)}>
                Mark as paid
              </button>
              {client.status === 'paused' ? (
                <button className="btn btn-secondary btn-sm" onClick={() => onResume(client.id, client.client)}>
                  Resume access
                </button>
              ) : (
                <button className="btn btn-danger btn-sm" onClick={() => onPause(client.id, client.client)}>
                  {pauseConfirm ? 'Click again to confirm' : 'Pause access'}
                </button>
              )}
            </div>
            <div>
              <div style={{ fontSize: '.78rem', fontWeight: 700, color: 'var(--ink-muted)', marginBottom: 8 }}>History</div>
              <div className="log-list">
                {client.history
                  .slice()
                  .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                  .map((h, i) => (
                    <div className="log-row" key={i}>
                      <div className="log-dot" style={{ background: actionColor(h.action) }} />
                      <div>
                        <div className="log-text">{h.note}</div>
                        <div className="log-time">{fmtDateTime(new Date(h.timestamp))}</div>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </>
      )}
    </aside>
  );
}
