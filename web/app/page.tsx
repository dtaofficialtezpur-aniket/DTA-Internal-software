'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiCall, fetchList, hasBackend, type BackendConn } from '@/lib/backend';
import { diffDays, fmtDate, fmtDateTime, fmtMoney, maskKey, timeAgo } from '@/lib/format';
import type { Client, ClientStatus, Settings } from '@/lib/types';

type View = 'overview' | 'clients' | 'activity' | 'settings';

const TODAY = new Date();

function computeStatus(c: Client, leadDays: number): ClientStatus {
  if (c.status === 'paused') return 'paused';
  const d = diffDays(new Date(c.nextDue), TODAY);
  if (d < 0) return 'overdue';
  if (d <= leadDays) return 'due';
  return 'active';
}

const STATUS_META: Record<ClientStatus, { cls: string; label: string }> = {
  active: { cls: 'pill-active', label: 'Active' },
  due: { cls: 'pill-due', label: 'Due soon' },
  overdue: { cls: 'pill-overdue', label: 'Overdue' },
  paused: { cls: 'pill-paused', label: 'Paused' },
};

function Pill({ status }: { status: ClientStatus }) {
  const m = STATUS_META[status];
  return <span className={'pill ' + m.cls}>{m.label}</span>;
}

function actionColor(action: string) {
  if (action === 'paused') return 'var(--crit)';
  if (action === 'reminder') return 'var(--warn)';
  return 'var(--good)';
}

export default function Page() {
  const [view, setView] = useState<View>('overview');
  const [conn, setConn] = useState<BackendConn>({ backendUrl: '', adminKey: '' });
  const [connected, setConnected] = useState(false);
  const [settings, setSettings] = useState<Settings>({ agencyName: 'DTA', leadDays: 7, defaultGrace: 5 });
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | ClientStatus>('all');
  const [addOpen, setAddOpen] = useState(false);
  const [revealKey, setRevealKey] = useState(false);
  const [pauseConfirm, setPauseConfirm] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const refresh = useMemo(
    () => async (c: BackendConn) => {
      if (!hasBackend(c)) {
        setConnected(false);
        return;
      }
      try {
        const data = await fetchList(c);
        setConnected(true);
        setSettings(data.settings);
        setClients(data.clients);
      } catch (err) {
        setConnected(false);
        setToast('Could not reach backend: ' + (err as Error).message);
      }
    },
    []
  );

  // Loads saved connection details from this browser on first mount, then
  // fetches the client list once — an external-system sync, not app state
  // derived from props, so it belongs in an effect despite the lint rule.
  useEffect(() => {
    const backendUrl = localStorage.getItem('dta-subctl-backend-url') || '';
    const adminKey = localStorage.getItem('dta-subctl-admin-key') || '';
    const loaded = { backendUrl, adminKey };
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setConn(loaded);
    if (hasBackend(loaded)) refresh(loaded);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  function saveConn(next: BackendConn) {
    localStorage.setItem('dta-subctl-backend-url', next.backendUrl);
    localStorage.setItem('dta-subctl-admin-key', next.adminKey);
    setConn(next);
    setToast('Backend settings saved');
    refresh(next);
  }

  async function testConnection(c: BackendConn) {
    if (!hasBackend(c)) {
      setToast('Enter a backend URL and admin key first');
      return;
    }
    try {
      await fetchList(c);
      setConnected(true);
      setToast('Connection OK');
    } catch (err) {
      setConnected(false);
      setToast('Connection failed: ' + (err as Error).message);
    }
  }

  async function runAction(action: string, payload: Record<string, unknown>, successMsg: string) {
    try {
      await apiCall(conn, action, payload);
      setToast(successMsg);
      await refresh(conn);
    } catch (err) {
      setToast('Failed: ' + (err as Error).message);
    }
  }

  const selected = clients.find((c) => c.id === selectedId) || null;

  const rowsNeedingAttention = clients
    .map((c) => ({ c, status: computeStatus(c, settings.leadDays) }))
    .filter(({ status }) => status === 'due' || status === 'overdue')
    .sort((a, b) => diffDays(new Date(a.c.nextDue), TODAY) - diffDays(new Date(b.c.nextDue), TODAY));

  const filteredClients = clients
    .map((c) => ({ c, status: computeStatus(c, settings.leadDays) }))
    .filter(({ c, status }) => {
      const q = search.toLowerCase();
      const matchQ = !q || c.client.toLowerCase().includes(q) || c.software.toLowerCase().includes(q);
      const matchF = statusFilter === 'all' || statusFilter === status;
      return matchQ && matchF;
    });

  const counts = { active: 0, due: 0, overdue: 0, paused: 0 };
  let mrr = 0;
  clients.forEach((c) => {
    counts[computeStatus(c, settings.leadDays)]++;
    mrr += c.cycle === 'Annual' ? c.amount / 12 : c.amount;
  });

  const allHistory = clients
    .flatMap((c) => c.history.map((h) => ({ ...h, client: c.client, software: c.software, t: new Date(h.timestamp) })))
    .sort((a, b) => b.t.getTime() - a.t.getTime());

  function openDetail(id: string) {
    setSelectedId(id);
    setRevealKey(false);
    setPauseConfirm(false);
  }
  function closeDetail() {
    setSelectedId(null);
    setRevealKey(false);
    setPauseConfirm(false);
  }

  return (
    <div className="app">
      <nav className="sidebar" aria-label="Primary">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <rect x="3" y="2" width="3.4" height="12" rx="1.6" fill="var(--accent-ink)" />
              <rect x="9.6" y="2" width="3.4" height="12" rx="1.6" fill="var(--accent-ink)" />
            </svg>
          </div>
          <div>
            <div className="brand-name">DTA</div>
            <div className="brand-sub">Subscription Control</div>
          </div>
        </div>

        <div>
          <div className="nav-group-label">Manage</div>
          <div className="nav" role="tablist">
            <button className="nav-btn" aria-current={view === 'overview' ? 'page' : undefined} onClick={() => setView('overview')}>
              Overview
            </button>
            <button className="nav-btn" aria-current={view === 'clients' ? 'page' : undefined} onClick={() => setView('clients')}>
              Clients
            </button>
            <button className="nav-btn" aria-current={view === 'activity' ? 'page' : undefined} onClick={() => setView('activity')}>
              Activity Log
            </button>
          </div>
          <div className="nav-group-label">Build</div>
          <div className="nav">
            <button className="nav-btn" aria-current={view === 'settings' ? 'page' : undefined} onClick={() => setView('settings')}>
              Settings
            </button>
          </div>
        </div>

        <div className="sidebar-foot">
          <div>
            <span className={'conn-dot ' + (connected ? 'ok' : hasBackend(conn) ? 'bad' : '')} />
            <span>{connected ? 'Connected' : hasBackend(conn) ? 'Connection failed' : 'Not connected'}</span>
          </div>
          <div style={{ marginTop: 6 }}>
            Signed in as <b>DTA Admin</b>
          </div>
        </div>
      </nav>

      <main className="main">
        <div className="main-inner">
          {!hasBackend(conn) && (
            <div className="banner">
              <span>
                No backend connected yet — go to <b>Settings</b> and paste your Google Apps Script Web App URL + admin key to load
                real client data.
              </span>
              <button className="btn btn-secondary btn-sm" onClick={() => setView('settings')}>
                Open Settings
              </button>
            </div>
          )}

          {view === 'overview' && (
            <section>
              <div className="page-head">
                <div>
                  <h1>Overview</h1>
                  <div className="page-sub">Every client running DTA-built software, and what needs attention today.</div>
                </div>
                <button className="btn btn-primary" onClick={() => (hasBackend(conn) ? setAddOpen(true) : (setToast('Connect a backend in Settings first'), setView('settings')))}>
                  + Add client
                </button>
              </div>

              <div className="stat-grid">
                <div className="card stat-tile">
                  <div className="stat-label">Total clients</div>
                  <div className="stat-value tabular">{clients.length}</div>
                  <div className="stat-note">across all DTA builds</div>
                </div>
                <div className="card stat-tile">
                  <div className="stat-label">Active</div>
                  <div className="stat-value tabular">{counts.active}</div>
                  <div className="stat-note">in good standing</div>
                </div>
                <div className="card stat-tile tone-crit">
                  <div className="stat-label">Payment due / overdue</div>
                  <div className="stat-value tabular">{counts.due + counts.overdue}</div>
                  <div className="stat-note">{counts.overdue} overdue</div>
                </div>
                <div className="card stat-tile tone-warn">
                  <div className="stat-label">Paused</div>
                  <div className="stat-value tabular">{counts.paused}</div>
                  <div className="stat-note">access currently locked</div>
                </div>
                <div className="card stat-tile">
                  <div className="stat-label">Est. monthly recurring</div>
                  <div className="stat-value tabular">{fmtMoney(Math.round(mrr))}</div>
                  <div className="stat-note">from active + due plans</div>
                </div>
              </div>

              <div className="section-title">
                <h2>Needs attention</h2>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Client</th>
                      <th>Software</th>
                      <th>Status</th>
                      <th>Next due</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {rowsNeedingAttention.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="empty">
                          {hasBackend(conn) ? 'Nothing needs attention — every client is current.' : 'Connect a backend in Settings to load clients.'}
                        </td>
                      </tr>
                    ) : (
                      rowsNeedingAttention.map(({ c, status }) => {
                        const d = diffDays(new Date(c.nextDue), TODAY);
                        return (
                          <tr key={c.id} onClick={() => openDetail(c.id)}>
                            <td className="cell-name">{c.client}</td>
                            <td>{c.software}</td>
                            <td>
                              <Pill status={status} />
                            </td>
                            <td className="tabular">
                              {fmtDate(new Date(c.nextDue))}
                              <div className="cell-sub">{d < 0 ? Math.abs(d) + ' days overdue' : d + ' days left'}</div>
                            </td>
                            <td className="row-actions">
                              <button className="btn btn-secondary btn-sm" onClick={(e) => { e.stopPropagation(); openDetail(c.id); }}>
                                View
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {view === 'clients' && (
            <section>
              <div className="page-head">
                <div>
                  <h1>Clients</h1>
                  <div className="page-sub">Every client software DTA has deployed, with its subscription state.</div>
                </div>
                <button className="btn btn-primary" onClick={() => (hasBackend(conn) ? setAddOpen(true) : (setToast('Connect a backend in Settings first'), setView('settings')))}>
                  + Add client
                </button>
              </div>

              <div className="toolbar" style={{ marginBottom: 14 }}>
                <div className="search">
                  <input type="text" placeholder="Search clients or software…" value={search} onChange={(e) => setSearch(e.target.value)} />
                </div>
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as 'all' | ClientStatus)}>
                  <option value="all">All statuses</option>
                  <option value="active">Active</option>
                  <option value="due">Due soon</option>
                  <option value="overdue">Overdue</option>
                  <option value="paused">Paused</option>
                </select>
              </div>

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Client</th>
                      <th>Plan</th>
                      <th>Next due</th>
                      <th>Status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredClients.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="empty">
                          {hasBackend(conn) ? 'No clients match this search.' : 'Connect a backend in Settings to load clients.'}
                        </td>
                      </tr>
                    ) : (
                      filteredClients.map(({ c, status }) => (
                        <tr key={c.id} onClick={() => openDetail(c.id)}>
                          <td>
                            <div className="cell-name">{c.client}</div>
                            <div className="cell-sub">{c.software}</div>
                          </td>
                          <td className="tabular">
                            {fmtMoney(c.amount)} <span style={{ color: 'var(--ink-faint)' }}>/ {c.cycle === 'Monthly' ? 'mo' : 'yr'}</span>
                          </td>
                          <td className="tabular">{fmtDate(new Date(c.nextDue))}</td>
                          <td>
                            <Pill status={status} />
                          </td>
                          <td className="row-actions">
                            <button className="btn btn-secondary btn-sm" onClick={(e) => { e.stopPropagation(); openDetail(c.id); }}>
                              View
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {view === 'activity' && (
            <section>
              <div className="page-head">
                <div>
                  <h1>Activity log</h1>
                  <div className="page-sub">Every onboarding, payment, pause and resume event, across all clients.</div>
                </div>
              </div>
              <div className="card" style={{ padding: '6px 16px' }}>
                <div className="log-list">
                  {allHistory.length === 0 ? (
                    <div className="empty">{hasBackend(conn) ? 'No activity yet.' : 'Connect a backend in Settings to load activity.'}</div>
                  ) : (
                    allHistory.map((e, i) => (
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
          )}

          {view === 'settings' && (
            <SettingsView
              key={`${conn.backendUrl}|${conn.adminKey}|${settings.agencyName}|${settings.leadDays}|${settings.defaultGrace}`}
              conn={conn}
              connected={connected}
              settings={settings}
              onSaveConn={saveConn}
              onTestConnection={testConnection}
              onSaveSettings={(payload) => runAction('updateSettings', payload, 'Settings saved')}
            />
          )}
        </div>
      </main>

      <div className={'backdrop' + (selectedId || addOpen ? ' open' : '')} onClick={() => { closeDetail(); setAddOpen(false); }} />

      <aside className={'panel' + (selectedId ? ' open' : '')} aria-label="Client detail">
        {selected && (
          <>
            <div className="panel-head">
              <div>
                <div style={{ fontSize: '.72rem', color: 'var(--ink-faint)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                  {selected.id}
                </div>
                <h2 style={{ fontSize: '1.1rem', marginTop: 2 }}>{selected.client}</h2>
                <div className="page-sub" style={{ marginTop: 2 }}>{selected.software}</div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={closeDetail} aria-label="Close">✕</button>
            </div>
            <div className="panel-body">
              <div>
                <Pill status={computeStatus(selected, settings.leadDays)} />
              </div>
              <div>
                <div className="field-row"><span>Plan</span><span className="tabular">{fmtMoney(selected.amount)} / {selected.cycle === 'Monthly' ? 'month' : 'year'}</span></div>
                <div className="field-row"><span>Started</span><span>{fmtDate(new Date(selected.start))}</span></div>
                <div className="field-row"><span>Next due</span><span>{fmtDate(new Date(selected.nextDue))}</span></div>
                <div className="field-row"><span>Grace period</span><span>{selected.grace} days</span></div>
              </div>
              <div>
                <div style={{ fontSize: '.78rem', fontWeight: 700, color: 'var(--ink-muted)', marginBottom: 6 }}>Client ID</div>
                <div className="key-box"><code>{selected.id}</code></div>
                <div style={{ fontSize: '.78rem', fontWeight: 700, color: 'var(--ink-muted)', margin: '12px 0 6px' }}>API key</div>
                <div className="key-box">
                  <code>{revealKey ? selected.apiKey : maskKey(selected.apiKey)}</code>
                  <button className="btn btn-ghost btn-sm" onClick={() => setRevealKey((r) => !r)}>{revealKey ? 'Hide' : 'Reveal'}</button>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      navigator.clipboard.writeText(selected.apiKey).then(
                        () => setToast('API key copied'),
                        () => setToast('Could not copy — select the key manually')
                      );
                    }}
                  >
                    Copy
                  </button>
                </div>
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ marginTop: 8 }}
                  onClick={() => runAction('regenerateKey', { id: selected.id }, 'API key regenerated for ' + selected.client)}
                >
                  Regenerate API key
                </button>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="btn btn-secondary btn-sm" onClick={() => runAction('markPaid', { id: selected.id }, 'Payment recorded for ' + selected.client)}>
                  Mark as paid
                </button>
                {selected.status === 'paused' ? (
                  <button className="btn btn-secondary btn-sm" onClick={() => runAction('resume', { id: selected.id }, selected.client + ' resumed')}>
                    Resume access
                  </button>
                ) : (
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={() => {
                      if (pauseConfirm) {
                        runAction('pause', { id: selected.id }, selected.client + ' paused');
                        setPauseConfirm(false);
                      } else {
                        setPauseConfirm(true);
                      }
                    }}
                  >
                    {pauseConfirm ? 'Click again to confirm' : 'Pause access'}
                  </button>
                )}
              </div>
              <div>
                <div style={{ fontSize: '.78rem', fontWeight: 700, color: 'var(--ink-muted)', marginBottom: 8 }}>History</div>
                <div className="log-list">
                  {selected.history
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

      {addOpen && (
        <AddClientModal
          defaultGrace={settings.defaultGrace}
          onCancel={() => setAddOpen(false)}
          onCreate={async (payload) => {
            try {
              await apiCall(conn, 'add', payload);
              setAddOpen(false);
              setView('clients');
              setToast(payload.client + ' added');
              await refresh(conn);
            } catch (err) {
              setToast('Failed: ' + (err as Error).message);
            }
          }}
        />
      )}

      <div className={'toast' + (toast ? ' show' : '')}>{toast}</div>
    </div>
  );
}

function SettingsView({
  conn,
  connected,
  settings,
  onSaveConn,
  onTestConnection,
  onSaveSettings,
}: {
  conn: BackendConn;
  connected: boolean;
  settings: Settings;
  onSaveConn: (c: BackendConn) => void;
  onTestConnection: (c: BackendConn) => void;
  onSaveSettings: (payload: { name: string; lead: number; grace: number }) => void;
}) {
  const [backendUrl, setBackendUrl] = useState(conn.backendUrl);
  const [adminKey, setAdminKey] = useState(conn.adminKey);
  const [name, setName] = useState(settings.agencyName);
  const [lead, setLead] = useState(settings.leadDays);
  const [grace, setGrace] = useState(settings.defaultGrace);

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>Settings</h1>
          <div className="page-sub">Connect the dashboard to your backend, and set defaults used across every client&apos;s subscription check.</div>
        </div>
      </div>

      <div className="card" style={{ padding: '20px 22px', marginBottom: 18 }}>
        <h2 style={{ fontSize: '1rem', marginBottom: 4 }}>Backend connection</h2>
        <div className="page-sub" style={{ marginBottom: 14 }}>The Google Apps Script Web App URL and admin key from SETUP.md.</div>
        <form
          className="settings-form"
          onSubmit={(e) => { e.preventDefault(); onSaveConn({ backendUrl: backendUrl.trim(), adminKey: adminKey.trim() }); }}
        >
          <label>
            Backend URL
            <input type="url" placeholder="https://script.google.com/macros/s/XXXX/exec" value={backendUrl} onChange={(e) => setBackendUrl(e.target.value)} />
          </label>
          <div className="settings-hint">Ends in <code>/exec</code>. From Apps Script → Deploy → Web app.</div>
          <label>
            Admin key
            <input type="password" placeholder="paste the key from the setup() run" value={adminKey} onChange={(e) => setAdminKey(e.target.value)} />
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" className="btn btn-primary">Save &amp; connect</button>
            <button type="button" className="btn btn-secondary" onClick={() => onTestConnection({ backendUrl: backendUrl.trim(), adminKey: adminKey.trim() })}>
              Test connection
            </button>
          </div>
          <div className="settings-hint">{connected ? 'Connected.' : 'Not connected yet.'}</div>
        </form>
      </div>

      <div className="card" style={{ padding: '20px 22px' }}>
        <h2 style={{ fontSize: '1rem', marginBottom: 4 }}>Defaults</h2>
        <div className="page-sub" style={{ marginBottom: 14 }}>Stored on the backend, shared by every client check-in.</div>
        <form className="settings-form" onSubmit={(e) => { e.preventDefault(); onSaveSettings({ name: name.trim() || 'DTA', lead: Number(lead) || 7, grace: Number(grace) || 5 }); }}>
          <label>
            Agency display name
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label>
            &quot;Due soon&quot; warning window (days before the due date)
            <input type="number" min={1} max={30} value={lead} onChange={(e) => setLead(Number(e.target.value))} />
          </label>
          <label>
            Default grace period for new clients (days)
            <input type="number" min={0} max={30} value={grace} onChange={(e) => setGrace(Number(e.target.value))} />
          </label>
          <div>
            <button type="submit" className="btn btn-primary">Save settings</button>
          </div>
        </form>
      </div>
    </section>
  );
}

function AddClientModal({
  defaultGrace,
  onCancel,
  onCreate,
}: {
  defaultGrace: number;
  onCancel: () => void;
  onCreate: (payload: { client: string; software: string; cycle: string; amount: number; start: string; grace: number }) => void;
}) {
  const [client, setClient] = useState('');
  const [software, setSoftware] = useState('');
  const [amount, setAmount] = useState('');
  const [cycle, setCycle] = useState('Monthly');
  const [start, setStart] = useState(() => new Date().toISOString().slice(0, 10));
  const [grace, setGrace] = useState(defaultGrace);

  return (
    <div className="modal-wrap open">
      <div className="modal">
        <h2 style={{ fontSize: '1.15rem' }}>Add a client</h2>
        <div className="page-sub">Creates a Client ID and API key for a new DTA software deployment.</div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onCreate({ client: client.trim(), software: software.trim(), cycle, amount: Number(amount) || 0, start, grace: Number(grace) || defaultGrace });
          }}
        >
          <div className="form-grid">
            <label className="full">
              Client company name
              <input type="text" required placeholder="e.g. Coastal Traders LLP" value={client} onChange={(e) => setClient(e.target.value)} />
            </label>
            <label className="full">
              Software name
              <input type="text" required placeholder="e.g. Coastal Billing" value={software} onChange={(e) => setSoftware(e.target.value)} />
            </label>
            <label>
              Plan amount (₹)
              <input type="number" min={0} required placeholder="5000" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </label>
            <label>
              Billing cycle
              <select value={cycle} onChange={(e) => setCycle(e.target.value)}>
                <option value="Monthly">Monthly</option>
                <option value="Annual">Annual</option>
              </select>
            </label>
            <label>
              Start date
              <input type="date" required value={start} onChange={(e) => setStart(e.target.value)} />
            </label>
            <label>
              Grace period (days)
              <input type="number" min={0} value={grace} onChange={(e) => setGrace(Number(e.target.value))} />
            </label>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
            <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancel</button>
            <button type="submit" className="btn btn-primary">Create client</button>
          </div>
        </form>
      </div>
    </div>
  );
}
