// App-wide state. Everything lives in one object persisted to localStorage for now;
// `update` is the single write path, so swapping in the cloud API later only touches this file.
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { buildSeed, DEMO_PINS } from './seed.js';
import { nowIso, uid } from './format.js';

const KEY = 'stc-erp-v1';
const SESSION_KEY = 'stc-erp-user';
const Ctx = createContext(null);

export async function hashPin(username, pin) {
  const data = new TextEncoder().encode(`stc:${username}:${pin}`);
  if (crypto?.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', data);
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  let h = 2166136261;
  for (const b of data) h = Math.imul(h ^ b, 16777619);
  return 'f' + (h >>> 0).toString(16);
}

async function freshDb() {
  const db = buildSeed();
  for (const u of db.users) u.pinHash = await hashPin(u.username, DEMO_PINS[u.username]);
  return db;
}

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; }
}

export function StoreProvider({ children }) {
  const [db, setDb] = useState(load);
  const [userId, setUserId] = useState(() => { try { return sessionStorage.getItem(SESSION_KEY); } catch { return null; } });
  const [toasts, setToasts] = useState([]);
  const dbRef = useRef(db);
  dbRef.current = db;

  useEffect(() => { if (!db) freshDb().then(setDb); }, [db]);
  useEffect(() => { if (db) try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* storage full or blocked */ } }, [db]);

  const user = db?.users.find((u) => u.id === userId && u.active) || null;

  const toast = useCallback((text, tone = 'ok') => {
    const id = uid();
    setToasts((t) => [...t, { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3600);
  }, []);

  // mutate receives a deep copy to change in place; audit = [action, entity, detail].
  const update = useCallback((mutate, audit) => {
    const next = structuredClone(dbRef.current);
    const result = mutate(next);
    if (audit) {
      const [action, entity, detail] = audit;
      next.audit.unshift({ id: uid('a'), ts: nowIso(), userId: userId, userName: next.users.find((u) => u.id === userId)?.name || 'System', action, entity, detail });
      if (next.audit.length > 5000) next.audit.length = 5000;
    }
    dbRef.current = next;
    setDb(next);
    return result;
  }, [userId]);

  const login = useCallback(async (username, pin) => {
    const u = dbRef.current.users.find((x) => x.username === username.trim().toLowerCase() && x.active);
    if (!u || u.pinHash !== await hashPin(u.username, pin)) return false;
    setUserId(u.id);
    try { sessionStorage.setItem(SESSION_KEY, u.id); } catch { /* ignore */ }
    const next = structuredClone(dbRef.current);
    next.audit.unshift({ id: uid('a'), ts: nowIso(), userId: u.id, userName: u.name, action: 'Logged in', entity: 'Session', detail: ROLE_LABEL(u.role) });
    dbRef.current = next;
    setDb(next);
    return true;
  }, []);

  // Checks another user's PIN for approvals / overrides without switching user.
  const verifyPin = useCallback(async (approverId, pin) => {
    const u = dbRef.current.users.find((x) => x.id === approverId && x.active);
    return !!u && u.pinHash === await hashPin(u.username, pin);
  }, []);

  const logout = useCallback(() => {
    update(() => {}, ['Logged out', 'Session', '']);
    setUserId(null);
    try { sessionStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
  }, [update]);

  const resetDemo = useCallback(async () => { const d = await freshDb(); dbRef.current = d; setDb(d); }, []);

  return (
    <Ctx.Provider value={{ db, user, update, login, logout, verifyPin, toast, toasts, resetDemo }}>
      {children}
    </Ctx.Provider>
  );
}

const ROLE_LABEL = (r) => r.replace('_', ' ');

export const useStore = () => useContext(Ctx);
