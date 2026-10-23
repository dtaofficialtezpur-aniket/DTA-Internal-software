'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { hydrate } from '@/lib/store';
import { asset } from '@/lib/asset';

// ---------------------------------------------------------------- toasts
const ToastCtx = createContext<(msg: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

// ---------------------------------------------------------------- PWA (install, update, offline)
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}
interface PwaState { canInstall: boolean; install: () => Promise<void>; online: boolean; updateReady: boolean; applyUpdate: () => void }
const PwaCtx = createContext<PwaState>({ canInstall: false, install: async () => {}, online: true, updateReady: false, applyUpdate: () => {} });
export const usePwa = () => useContext(PwaCtx);

export default function Providers({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const toast = useCallback((m: string) => {
    setMsg(m);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setMsg(''), 3200);
  }, []);

  const [installEvt, setInstallEvt] = useState<BeforeInstallPromptEvent | null>(null);
  const [online, setOnline] = useState(true);
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    hydrate();
    const onStorageErr = () => toast('Could not save — browser storage is full or blocked');
    window.addEventListener('dta-storage-error', onStorageErr);

    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);

    const onPrompt = (e: Event) => { e.preventDefault(); setInstallEvt(e as BeforeInstallPromptEvent); };
    const onInstalled = () => { setInstallEvt(null); toast('DTA Tracker installed'); };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);

    // Service worker (production builds only, so dev hot-reload is never cached)
    let reloading = false;
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register(asset('/sw.js'), { scope: asset('/') }).then((reg) => {
        if (reg.waiting && navigator.serviceWorker.controller) setWaiting(reg.waiting);
        reg.addEventListener('updatefound', () => {
          const w = reg.installing;
          w?.addEventListener('statechange', () => {
            if (w.state === 'installed' && navigator.serviceWorker.controller) setWaiting(w);
          });
        });
      }).catch(() => {});
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloading) return;
        reloading = true;
        window.location.reload();
      });
    }
    return () => {
      window.removeEventListener('dta-storage-error', onStorageErr);
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, [toast]);

  const pwa = useMemo<PwaState>(() => ({
    canInstall: !!installEvt,
    install: async () => { if (!installEvt) return; await installEvt.prompt(); await installEvt.userChoice; setInstallEvt(null); },
    online,
    updateReady: !!waiting,
    applyUpdate: () => waiting?.postMessage({ type: 'SKIP_WAITING' }),
  }), [installEvt, online, waiting]);

  return (
    <ToastCtx.Provider value={toast}>
      <PwaCtx.Provider value={pwa}>
        {children}
        <div
          role="status" aria-live="polite"
          className={`pointer-events-none fixed bottom-5 left-1/2 z-[100] -translate-x-1/2 rounded-full bg-brand-dark px-5 py-2.5 text-sm text-white shadow-xl transition-opacity ${msg ? 'opacity-100' : 'opacity-0'}`}
        >
          {msg}
        </div>
      </PwaCtx.Provider>
    </ToastCtx.Provider>
  );
}
