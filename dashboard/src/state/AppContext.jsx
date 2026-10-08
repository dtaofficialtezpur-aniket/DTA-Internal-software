import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { BACKEND_URL } from '../constants.js';
import { rawApiCall, isAuthErrorMessage } from '../api.js';
import {
  getKeyval, setKeyval, deleteKeyval,
  queuePendingAction, listPendingActions, removePendingAction,
} from '../offline/db.js';

const AppContext = createContext(null);

// Mutations safe to queue while offline and replay later, mapped to how
// to reflect them locally in the meantime. The rest (file uploads, team/
// folder management, login, list) need a live server round-trip and just
// fail normally when offline — see `call` below.
const RECORD_ID_ACTIONS = new Set([
  'pause', 'resume', 'markPaid', 'regenerateKey',
  'updateNormalClient', 'recordNormalClientPayment', 'deleteNormalClient',
]);
const OFFLINE_QUEUEABLE = new Set([...RECORD_ID_ACTIONS, 'add', 'addNormalClient', 'updateSettings']);

function isNetworkError(err){
  // fetch() rejects with a generic TypeError ("Failed to fetch" / "Load
  // failed") when there's no connectivity — there's no dedicated offline
  // error type, so a TypeError here is the closest reliable signal.
  return !navigator.onLine || err instanceof TypeError;
}

export function AppProvider({ children }){
  // Persisted in IndexedDB (see offline/db.js) so an installed/offline
  // app opens straight to the dashboard instead of a login screen with
  // nothing to check the PIN against.
  const [auth, setAuth] = useState({ token: null, user: null });
  const [clients, setClients] = useState([]);
  const [normalClients, setNormalClients] = useState([]);
  const [folders, setFolders] = useState([]);
  const [files, setFiles] = useState([]);
  const [settings, setSettings] = useState({ name: 'DTA', lead: 7, grace: 5, idPrefix: 'DTA-D', idDigits: 3 });
  const [pendingCount, setPendingCount] = useState(0);
  const syncingRef = useRef(false);

  // Shared overlay state — client detail panel, add-client modal, and the
  // file-access modal all sit behind one backdrop, and Escape closes all
  // three, so they're lifted here instead of living in separate pages.
  const [selectedClientId, setSelectedClientId] = useState(null);
  const [selectedNormalClientId, setSelectedNormalClientId] = useState(null);
  const [addClientOpen, setAddClientOpen] = useState(false);
  const [addClientType, setAddClientType] = useState(null); // null = type chooser; 'subscription' | 'normal'
  const [accessModalFile, setAccessModalFile] = useState(null);

  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const showToast = useCallback((msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);

  const doLogout = useCallback(() => {
    setAuth((current) => {
      if (current.token){
        fetch(BACKEND_URL, {
          method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ action: 'logout', token: current.token }),
        }).catch(() => {});
      }
      return { token: null, user: null };
    });
    deleteKeyval('auth').catch(() => {});
    deleteKeyval('cache').catch(() => {}); // don't leave another user's data cached on a shared device
    setClients([]); setNormalClients([]); setFolders([]); setFiles([]);
    setSelectedClientId(null); setSelectedNormalClientId(null);
    setAddClientOpen(false); setAddClientType(null); setAccessModalFile(null);
  }, []);

  const login = useCallback((token, user) => {
    setAuth({ token, user });
    setKeyval('auth', { token, user }).catch(() => {});
  }, []);

  const applyOfflineLocally = useCallback((action, payload) => {
    if (action === 'deleteNormalClient'){
      setNormalClients((list) => list.filter((c) => c.id !== payload.id));
    } else if (RECORD_ID_ACTIONS.has(action)){
      // Flag the record so the UI shows it's not yet confirmed by the
      // server — exact recomputed fields (due dates, balances) only
      // become accurate once this syncs, so we don't try to guess them.
      setClients((list) => list.map((c) => (c.id === payload.id ? { ...c, pendingSync: true } : c)));
      setNormalClients((list) => list.map((c) => (c.id === payload.id ? { ...c, pendingSync: true } : c)));
    }
    // 'add' / 'addNormalClient' / 'updateSettings' have no existing local
    // record to flag — the pending-count badge is the only feedback until
    // they sync and a refresh brings in the real record.
  }, []);

  const call = useCallback((action, payload) => {
    const offlineCapable = OFFLINE_QUEUEABLE.has(action);

    const queueOffline = () => {
      return queuePendingAction(action, payload).then(() => {
        setPendingCount((n) => n + 1);
        applyOfflineLocally(action, payload);
        return { ok: true, offlineQueued: true };
      });
    };

    if (offlineCapable && !navigator.onLine){
      return queueOffline();
    }

    return rawApiCall(BACKEND_URL, auth.token, action, payload).then((data) => {
      if (data && data.error){
        if (isAuthErrorMessage(data.error) && auth.token){
          doLogout();
          showToast('Please log in again.');
        }
        throw new Error(data.error);
      }
      return data;
    }).catch((err) => {
      if (offlineCapable && isNetworkError(err)) return queueOffline();
      if (isNetworkError(err)) throw new Error('You’re offline — this needs an internet connection.');
      throw err;
    });
  }, [auth.token, doLogout, showToast, applyOfflineLocally]);

  const refreshFromBackend = useCallback(() => {
    return call('list').then((data) => {
      const nextSettings = {
        name: data.settings.agencyName || 'DTA',
        lead: Number(data.settings.leadDays) || 7,
        grace: Number(data.settings.defaultGrace) || 5,
        idPrefix: data.settings.idPrefix || 'DTA-D',
        idDigits: Number(data.settings.idDigits) || 3,
      };
      const nextClients = data.clients.map((c) => ({
        ...c,
        start: new Date(c.start), nextDue: new Date(c.nextDue),
        pausedAt: c.pausedAt ? new Date(c.pausedAt) : null,
        history: (c.history || []).map((h) => ({ ...h, t: new Date(h.timestamp) }))
          .sort((a, b) => b.t - a.t),
      }));
      const nextNormalClients = (data.normalClients || []).map((c) => ({
        ...c,
        createdAt: new Date(c.createdAt),
        history: (c.history || []).map((h) => ({ ...h, t: new Date(h.timestamp) }))
          .sort((a, b) => b.t - a.t),
      }));
      setSettings(nextSettings);
      setClients(nextClients);
      setNormalClients(nextNormalClients);
      // Cache raw (pre-Date-conversion) data for offline hydration next launch.
      setKeyval('cache', {
        settings: data.settings,
        clients: data.clients,
        normalClients: data.normalClients || [],
      }).catch(() => {});
    }).catch((err) => {
      if (isNetworkError(err)){
        showToast(pendingCount > 0
          ? `Offline — showing saved data, ${pendingCount} change${pendingCount === 1 ? '' : 's'} waiting to sync`
          : 'Offline — showing last saved data');
      } else {
        showToast('Could not load data: ' + err.message);
      }
    });
  }, [call, showToast, pendingCount]);

  // One-time hydration from IndexedDB: lets a reopened/installed app show
  // the logged-in user and their last-known data instantly, with no
  // network round-trip, before refreshFromBackend's own fetch resolves.
  useEffect(() => {
    let cancelled = false;
    Promise.all([getKeyval('auth'), getKeyval('cache'), listPendingActions()]).then(([savedAuth, cached, pending]) => {
      if (cancelled) return;
      if (savedAuth && savedAuth.token) setAuth(savedAuth);
      if (cached){
        const pendingIds = new Set(pending.filter((p) => RECORD_ID_ACTIONS.has(p.action)).map((p) => p.payload && p.payload.id));
        setSettings({
          name: cached.settings.agencyName || 'DTA',
          lead: Number(cached.settings.leadDays) || 7,
          grace: Number(cached.settings.defaultGrace) || 5,
          idPrefix: cached.settings.idPrefix || 'DTA-D',
          idDigits: Number(cached.settings.idDigits) || 3,
        });
        setClients(cached.clients.map((c) => ({
          ...c,
          start: new Date(c.start), nextDue: new Date(c.nextDue),
          pausedAt: c.pausedAt ? new Date(c.pausedAt) : null,
          history: (c.history || []).map((h) => ({ ...h, t: new Date(h.timestamp) })).sort((a, b) => b.t - a.t),
          pendingSync: pendingIds.has(c.id),
        })));
        setNormalClients(cached.normalClients.map((c) => ({
          ...c,
          createdAt: new Date(c.createdAt),
          history: (c.history || []).map((h) => ({ ...h, t: new Date(h.timestamp) })).sort((a, b) => b.t - a.t),
          pendingSync: pendingIds.has(c.id),
        })));
      }
      setPendingCount(pending.length);
    });
    return () => { cancelled = true; };
  }, []);

  const syncPendingActions = useCallback(() => {
    if (syncingRef.current || !navigator.onLine) return Promise.resolve();
    syncingRef.current = true;
    return listPendingActions().then(async (pending) => {
      let synced = 0;
      for (const item of pending){
        try {
          const data = await rawApiCall(BACKEND_URL, auth.token, item.action, item.payload);
          if (data && data.error) throw new Error(data.error);
          await removePendingAction(item.id);
          synced++;
        } catch (err) {
          setPendingCount(pending.length - synced);
          if (synced > 0) showToast(`Synced ${synced} change${synced === 1 ? '' : 's'} — ${pending.length - synced} still pending`);
          else if (!isNetworkError(err)) showToast('Could not sync a pending change: ' + err.message);
          syncingRef.current = false;
          return;
        }
      }
      setPendingCount(0);
      if (synced > 0) showToast(`Back online — synced ${synced} change${synced === 1 ? '' : 's'}`);
      syncingRef.current = false;
      return refreshFromBackend();
    });
  }, [auth.token, showToast, refreshFromBackend]);

  useEffect(() => {
    window.addEventListener('online', syncPendingActions);
    return () => window.removeEventListener('online', syncPendingActions);
  }, [syncPendingActions]);

  const closeOverlays = useCallback(() => {
    setSelectedClientId(null); setSelectedNormalClientId(null);
    setAddClientOpen(false); setAddClientType(null);
    setAccessModalFile(null);
  }, []);

  const value = {
    auth, login,
    isLoggedIn: !!(auth.token && auth.user),
    clients, normalClients, folders, setFolders, files, setFiles, settings,
    selectedClientId, setSelectedClientId,
    selectedNormalClientId, setSelectedNormalClientId,
    addClientOpen, setAddClientOpen,
    addClientType, setAddClientType,
    accessModalFile, setAccessModalFile,
    closeOverlays,
    toast, showToast,
    pendingCount,
    call, doLogout, refreshFromBackend,
  };
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(){
  return useContext(AppContext);
}
