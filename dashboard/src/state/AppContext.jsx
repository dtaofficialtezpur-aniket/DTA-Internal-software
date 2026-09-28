import { createContext, useContext, useState, useCallback, useRef } from 'react';
import { BACKEND_URL } from '../constants.js';
import { rawApiCall, isAuthErrorMessage } from '../api.js';

const AppContext = createContext(null);

export function AppProvider({ children }){
  const [auth, setAuth] = useState({ token: null, user: null }); // never persisted — every launch requires the PIN again
  const [clients, setClients] = useState([]);
  const [normalClients, setNormalClients] = useState([]);
  const [folders, setFolders] = useState([]);
  const [files, setFiles] = useState([]);
  const [settings, setSettings] = useState({ name: 'DTA', lead: 7, grace: 5 });

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
    setClients([]); setNormalClients([]); setFolders([]); setFiles([]);
    setSelectedClientId(null); setSelectedNormalClientId(null);
    setAddClientOpen(false); setAddClientType(null); setAccessModalFile(null);
  }, []);

  const call = useCallback((action, payload) => {
    return rawApiCall(BACKEND_URL, auth.token, action, payload).then((data) => {
      if (data && data.error){
        if (isAuthErrorMessage(data.error) && auth.token){
          doLogout();
          showToast('Please log in again.');
        }
        throw new Error(data.error);
      }
      return data;
    });
  }, [auth.token, doLogout, showToast]);

  const refreshFromBackend = useCallback(() => {
    return call('list').then((data) => {
      setSettings({
        name: data.settings.agencyName || 'DTA',
        lead: Number(data.settings.leadDays) || 7,
        grace: Number(data.settings.defaultGrace) || 5,
      });
      setClients(data.clients.map((c) => ({
        ...c,
        start: new Date(c.start), nextDue: new Date(c.nextDue),
        pausedAt: c.pausedAt ? new Date(c.pausedAt) : null,
        history: (c.history || []).map((h) => ({ ...h, t: new Date(h.timestamp) }))
          .sort((a, b) => b.t - a.t),
      })));
      setNormalClients((data.normalClients || []).map((c) => ({
        ...c,
        createdAt: new Date(c.createdAt),
        history: (c.history || []).map((h) => ({ ...h, t: new Date(h.timestamp) }))
          .sort((a, b) => b.t - a.t),
      })));
    }).catch((err) => showToast('Could not load data: ' + err.message));
  }, [call, showToast]);

  const closeOverlays = useCallback(() => {
    setSelectedClientId(null); setSelectedNormalClientId(null);
    setAddClientOpen(false); setAddClientType(null);
    setAccessModalFile(null);
  }, []);

  const value = {
    auth, login: (token, user) => setAuth({ token, user }),
    isLoggedIn: !!(auth.token && auth.user),
    clients, normalClients, folders, setFolders, files, setFiles, settings,
    selectedClientId, setSelectedClientId,
    selectedNormalClientId, setSelectedNormalClientId,
    addClientOpen, setAddClientOpen,
    addClientType, setAddClientType,
    accessModalFile, setAccessModalFile,
    closeOverlays,
    toast, showToast,
    call, doLogout, refreshFromBackend,
  };
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(){
  return useContext(AppContext);
}
