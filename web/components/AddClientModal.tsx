'use client';

import { useState } from 'react';
import type { NewClientPayload } from '@/lib/hooks/useDashboard';

export function AddClientModal({
  defaultGrace,
  onCancel,
  onCreate,
}: {
  defaultGrace: number;
  onCancel: () => void;
  onCreate: (payload: NewClientPayload) => void;
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
            <button type="button" className="btn btn-ghost" onClick={onCancel}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Create client
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
