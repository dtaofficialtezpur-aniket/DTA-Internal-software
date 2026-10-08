import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { BACKEND_URL } from '../constants.js';
import { rawApiCall } from '../api.js';

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

// The login token lives only in memory: closing the app means entering the PIN again.
export function AppProvider({ children }){
  const [user, setUser] = useState(null);
  const [toast, setToast] = useState(null);
  const [pendingDemos, setPendingDemos] = useState(0);
  const tokenRef = useRef(null);
  const toastTimer = useRef(null);

  const showToast = useCallback((msg, kind = 'ok') => {
    setToast({ msg, kind });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }, []);

  const login = useCallback((token, u) => { tokenRef.current = token; setPendingDemos(0); setUser(u); }, []);
  const logout = useCallback(() => { tokenRef.current = null; setPendingDemos(0); setUser(null); }, []);

  const call = useCallback(async (action, payload) => {
    try {
      return await rawApiCall(BACKEND_URL, tokenRef.current, action, payload);
    } catch (err) {
      if (err.status === 401 && tokenRef.current) { // session ended or access removed
        tokenRef.current = null; setUser(null);
        showToast(err.message, 'err');
      }
      throw err;
    }
  }, [showToast]);

  // Heartbeat: tells the server this person has the app open, so the admin can see who is online.
  useEffect(() => {
    if (!user) return undefined;
    const beat = () => { call('ping').catch(() => {}); };
    const id = setInterval(beat, 45000);
    window.addEventListener('focus', beat);
    return () => { clearInterval(id); window.removeEventListener('focus', beat); };
  }, [user, call]);

  const endSession = useCallback(() => { call('logout').catch(() => {}); logout(); }, [call, logout]);

  const value = useMemo(() => ({ user, call, login, logout: endSession, toast, showToast, pendingDemos, setPendingDemos }), [user, call, login, endSession, toast, showToast, pendingDemos]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
