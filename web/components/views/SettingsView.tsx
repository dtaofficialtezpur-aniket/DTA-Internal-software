'use client';

import { useState } from 'react';
import type { BackendConn } from '@/lib/backend';
import type { Settings } from '@/lib/types';

export function SettingsView({
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
        <div className="page-sub" style={{ marginBottom: 14 }}>
          The Google Apps Script Web App URL and admin key from SETUP.md.
        </div>
        <form
          className="settings-form"
          onSubmit={(e) => {
            e.preventDefault();
            onSaveConn({ backendUrl: backendUrl.trim(), adminKey: adminKey.trim() });
          }}
        >
          <label>
            Backend URL
            <input type="url" placeholder="https://script.google.com/macros/s/XXXX/exec" value={backendUrl} onChange={(e) => setBackendUrl(e.target.value)} />
          </label>
          <div className="settings-hint">
            Ends in <code>/exec</code>. From Apps Script → Deploy → Web app.
          </div>
          <label>
            Admin key
            <input type="password" placeholder="paste the key from the setup() run" value={adminKey} onChange={(e) => setAdminKey(e.target.value)} />
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" className="btn btn-primary">
              Save &amp; connect
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => onTestConnection({ backendUrl: backendUrl.trim(), adminKey: adminKey.trim() })}>
              Test connection
            </button>
          </div>
          <div className="settings-hint">{connected ? 'Connected.' : 'Not connected yet.'}</div>
        </form>
      </div>

      <div className="card" style={{ padding: '20px 22px' }}>
        <h2 style={{ fontSize: '1rem', marginBottom: 4 }}>Defaults</h2>
        <div className="page-sub" style={{ marginBottom: 14 }}>
          Stored on the backend, shared by every client check-in.
        </div>
        <form
          className="settings-form"
          onSubmit={(e) => {
            e.preventDefault();
            onSaveSettings({ name: name.trim() || 'DTA', lead: Number(lead) || 7, grace: Number(grace) || 5 });
          }}
        >
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
            <button type="submit" className="btn btn-primary">
              Save settings
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
