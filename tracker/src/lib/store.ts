'use client';
import { useSyncExternalStore } from 'react';
import { DEPTS } from './constants';
import type { AppData, Dept } from './types';

/**
 * A tiny external store. All data lives in the browser (localStorage) so the app works
 * offline and nothing ever leaves the user's device. Every change is persisted immediately.
 */
export const STORAGE_KEY = 'dta-tracker-v1';

const DEFAULT_CASH = (id: number, dept: Dept) => ({ id, dept, name: 'Cash', group: 'Cash-in-hand', open: 0 });

/** A brand-new, empty book set: no clients, leads or vouchers — only a Cash ledger per department. */
export function emptyData(): AppData {
  return {
    clients: [], leads: [], deleted: [], vouchers: [], activity: [],
    ledgers: DEPTS.map((d, i) => DEFAULT_CASH(i + 1, d)),
    seq: DEPTS.length + 1,
    settings: { gstTogether: true },
  };
}

const SERVER_STATE = emptyData();
let state: AppData = SERVER_STATE;
let hydrated = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

const maxId = (d: AppData) =>
  Math.max(
    0,
    ...d.clients.map((x) => x.id), ...d.deleted.map((x) => x.id), ...d.leads.map((x) => x.id),
    ...d.ledgers.map((x) => x.id), ...d.vouchers.map((x) => x.id), ...d.activity.map((x) => x.id),
  );

/** Makes sure imported / stored data is well-formed. */
export function normalize(raw: Partial<AppData>): AppData {
  const d: AppData = {
    clients: raw.clients ?? [], leads: raw.leads ?? [], deleted: raw.deleted ?? [],
    ledgers: raw.ledgers ?? [], vouchers: raw.vouchers ?? [], activity: raw.activity ?? [],
    seq: 0,
    settings: { gstTogether: raw.settings?.gstTogether ?? true },
  };
  d.seq = Math.max(raw.seq ?? 0, maxId(d) + 1);
  for (const dept of DEPTS) {
    if (!d.ledgers.some((l) => l.dept === dept && l.name.toLowerCase() === 'cash')) {
      d.ledgers.push(DEFAULT_CASH(d.seq++, dept));
    }
  }
  return d;
}

function load() {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    state = s ? normalize(JSON.parse(s)) : normalize({});
  } catch {
    state = normalize({});
  }
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    window.dispatchEvent(new CustomEvent('dta-storage-error'));
  }
}

export function hydrate() {
  if (hydrated || typeof window === 'undefined') return;
  load();
  hydrated = true;
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY) { load(); notify(); } // another tab changed the data
  });
  notify();
}

export const getState = () => state;
export const isHydrated = () => hydrated;

/** Apply a change. The mutator receives a deep copy; the store swaps it in and persists. */
export function mutate<T = void>(fn: (d: AppData) => T): T {
  const next = structuredClone(state);
  const result = fn(next);
  state = next;
  persist();
  notify();
  return result;
}

export function replaceAll(d: AppData) {
  state = normalize(d);
  persist();
  notify();
}

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
export const useData = () => useSyncExternalStore(subscribe, () => state, () => SERVER_STATE);
export const useHydrated = () => useSyncExternalStore(subscribe, () => hydrated, () => false);
