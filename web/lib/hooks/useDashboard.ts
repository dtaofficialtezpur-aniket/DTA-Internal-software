'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiCall, fetchList, hasBackend, type BackendConn } from '@/lib/backend';
import { diffDays } from '@/lib/format';
import { computeStatus } from '@/lib/status';
import type { Client, ClientStatus, Settings } from '@/lib/types';

export type View = 'overview' | 'clients' | 'activity' | 'settings';

export interface NewClientPayload {
  client: string;
  software: string;
  cycle: string;
  amount: number;
  start: string;
  grace: number;
}

const TODAY = new Date();

/**
 * All dashboard state and backend actions in one place. Mirrors
 * dashboard/index.html's script — keep the two in sync when either changes.
 */
export function useDashboard() {
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

  const connectedToBackend = hasBackend(conn);

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

  async function createClient(payload: NewClientPayload) {
    try {
      await apiCall(conn, 'add', payload);
      setAddOpen(false);
      setView('clients');
      setToast(payload.client + ' added');
      await refresh(conn);
    } catch (err) {
      setToast('Failed: ' + (err as Error).message);
    }
  }

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

  function requireBackendThenOpenAdd() {
    if (connectedToBackend) {
      setAddOpen(true);
    } else {
      setToast('Connect a backend in Settings first');
      setView('settings');
    }
  }

  const selected = clients.find((c) => c.id === selectedId) || null;

  const rowsNeedingAttention = clients
    .map((c) => ({ c, status: computeStatus(c, settings.leadDays, TODAY) }))
    .filter(({ status }) => status === 'due' || status === 'overdue')
    .sort((a, b) => diffDays(new Date(a.c.nextDue), TODAY) - diffDays(new Date(b.c.nextDue), TODAY));

  const filteredClients = clients
    .map((c) => ({ c, status: computeStatus(c, settings.leadDays, TODAY) }))
    .filter(({ c, status }) => {
      const q = search.toLowerCase();
      const matchQ = !q || c.client.toLowerCase().includes(q) || c.software.toLowerCase().includes(q);
      const matchF = statusFilter === 'all' || statusFilter === status;
      return matchQ && matchF;
    });

  const counts = { active: 0, due: 0, overdue: 0, paused: 0 };
  let mrr = 0;
  clients.forEach((c) => {
    counts[computeStatus(c, settings.leadDays, TODAY)]++;
    mrr += c.cycle === 'Annual' ? c.amount / 12 : c.amount;
  });

  const allHistory = clients
    .flatMap((c) => c.history.map((h) => ({ ...h, client: c.client, software: c.software, t: new Date(h.timestamp) })))
    .sort((a, b) => b.t.getTime() - a.t.getTime());

  return {
    today: TODAY,
    view,
    setView,
    conn,
    connected,
    connectedToBackend,
    settings,
    clients,
    selected,
    selectedId,
    openDetail,
    closeDetail,
    search,
    setSearch,
    statusFilter,
    setStatusFilter,
    rowsNeedingAttention,
    filteredClients,
    counts,
    mrr,
    allHistory,
    addOpen,
    setAddOpen,
    requireBackendThenOpenAdd,
    revealKey,
    setRevealKey,
    pauseConfirm,
    setPauseConfirm,
    toast,
    setToast,
    saveConn,
    testConnection,
    runAction,
    createClient,
  };
}

export type Dashboard = ReturnType<typeof useDashboard>;
