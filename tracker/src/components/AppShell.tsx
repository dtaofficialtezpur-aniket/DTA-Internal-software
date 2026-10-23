'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DEPTS, DEPT_LABEL, servicesOf } from '@/lib/constants';
import { alertsFor } from '@/lib/alerts';
import { asset } from '@/lib/asset';
import { exportBackup, importBackup } from '@/lib/actions';
import { route } from '@/lib/routes';
import { searchAll } from '@/lib/search';
import { useData, useHydrated } from '@/lib/store';
import type { Dept } from '@/lib/types';
import { cx, today } from '@/lib/utils';
import { isGroup, navFor } from './nav';
import { Modal, ModalActions } from './ui';
import { usePwa, useToast } from './Providers';

function useOutside(ref: React.RefObject<HTMLElement | null>, close: () => void) {
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) close(); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [ref, close]);
}

const linkCls = (on: boolean) =>
  cx(
    'group flex items-center rounded-xl px-3.5 py-2 text-sm transition',
    on ? 'bg-brand font-bold text-white shadow-[0_5px_0_var(--color-brand-dark),0_10px_18px_rgba(47,91,234,.3)] -translate-y-0.5' : 'text-ink hover:translate-x-1 hover:bg-soft',
  );
const dot = (on: boolean) =>
  cx('mr-2.5 inline-block size-2.5 shrink-0 rounded-full shadow-[0_2px_3px_rgba(0,0,0,.3)]',
    on ? 'bg-[radial-gradient(circle_at_30%_28%,#fff,#bfd0ff_70%)]' : 'bg-[radial-gradient(circle_at_30%_28%,#fff,var(--color-brand)_60%,var(--color-brand-dark))]');

function Sidebar({ dept, onNavigate }: { dept: Dept; onNavigate: () => void }) {
  const pathname = usePathname();
  const d = useData();
  const toast = useToast();
  const pwa = usePwa();
  const fileRef = useRef<HTMLInputElement>(null);
  const entries = useMemo(() => navFor(dept, d.deleted.filter((c) => c.type === dept).length), [dept, d.deleted]);
  const active = (href: string) => pathname === href || pathname.startsWith(href);

  const backup = () => {
    const blob = new Blob([JSON.stringify(exportBackup(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `DTA-client-data-backup-${today()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast('Full backup downloaded (JSON)');
  };
  const restore = (f: File | undefined) => {
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const o = JSON.parse(String(r.result));
        if (!confirm('Replace all current data with this backup?')) return;
        const err = importBackup(o);
        toast(err ?? 'Backup restored');
      } catch { toast('That file is not a valid DTA backup'); }
    };
    r.readAsText(f);
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div className="flex h-full flex-col overflow-y-auto px-3.5 py-4">
      <img src={asset('/logo.png')} alt="DTA – Digital · Trading · Accounts" width={150} height={150} className="mx-auto mb-2.5 h-auto w-[132px] drop-shadow-[0_6px_10px_rgba(31,41,55,.2)]" />
      <div className="mb-2.5 border-b-2 border-edge px-2.5 pb-3.5">
        <b className="block text-[17px] leading-tight text-ink">DTA Client Data Tracker</b>
        <span className="text-xs font-bold text-brand-dark">Accounts · Marketing · Trading</span>
      </div>
      <nav className="flex-1" aria-label="Main">
        {entries.map((e) =>
          isGroup(e) ? (
            <div key={e.title} className={cx('my-3 rounded-2xl border-[1.5px] border-edge bg-soft p-1.5 shadow-[0_4px_12px_rgba(31,41,55,.05)]', e.accent && 'border-l-[6px] border-l-brand bg-brand-soft/60')}>
              <div className="mx-2 mb-1.5 mt-1.5 text-[11px] font-extrabold uppercase tracking-widest text-brand-dark">{e.accent && '▦ '}{e.title}</div>
              {e.items.map((it) => {
                const on = active(it.href);
                return (
                  <Link key={it.href} href={it.href} onClick={onNavigate} className={linkCls(on)} aria-current={on ? 'page' : undefined}>
                    <span className={dot(on)} />
                    <span className="flex-1">{it.label}</span>
                    {!!it.badge && <span className="rounded-full bg-bad px-1.5 text-[11px] font-bold text-white">{it.badge}</span>}
                  </Link>
                );
              })}
            </div>
          ) : (
            <Link key={e.href} href={e.href} onClick={onNavigate} className={cx(linkCls(active(e.href)), 'my-0.5')} aria-current={active(e.href) ? 'page' : undefined}>
              <span className={dot(active(e.href))} />
              {e.label}
            </Link>
          ),
        )}
      </nav>
      <div className="mt-3 rounded-xl border-[1.5px] border-edge bg-soft p-3 text-xs leading-relaxed text-ink">
        All data is stored on this device only. Use backup to keep a copy.
        <div className="mt-2 flex flex-wrap gap-2">
          <button className="btn-sec btn-xs" onClick={backup}>Backup (JSON)</button>
          <button className="btn-sec btn-xs" onClick={() => fileRef.current?.click()}>Restore</button>
          {pwa.canInstall && <button className="btn-pri btn-xs !shadow-[0_2px_0_var(--color-brand-dark)]" onClick={pwa.install}>Install app</button>}
        </div>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => restore(e.target.files?.[0])} />
        <a href="https://dtaonline.in" target="_blank" rel="noopener noreferrer" className="mt-2 block font-bold text-brand-dark">dtaonline.in</a>
      </div>
    </div>
  );
}

function GlobalSearch() {
  const d = useData();
  const router = useRouter();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  useOutside(box, () => setOpen(false));
  const hits = useMemo(() => searchAll(d, q), [d, q]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(t.tagName)) { e.preventDefault(); input.current?.focus(); }
    };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, []);

  const go = (href: string) => { setOpen(false); setQ(''); input.current?.blur(); router.push(href); };
  return (
    <div ref={box} className="relative min-w-[200px] max-w-[380px] flex-1">
      <svg className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-mute" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
      <input
        ref={input} className="inp !rounded-full !py-2 !pl-10" placeholder="Search clients, leads, ledgers…  ( / )" aria-label="Search" autoComplete="off"
        value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)}
        onKeyDown={(e) => { if (e.key === 'Enter' && hits[0]) go(hits[0].href); if (e.key === 'Escape') { setOpen(false); input.current?.blur(); } }}
      />
      {open && q.trim().length >= 2 && (
        <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-30 max-h-[70vh] overflow-auto rounded-2xl border-[1.5px] border-edge bg-card p-1.5 shadow-2xl">
          {hits.length ? hits.map((h, i) => (
            <button key={i} className="flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2 text-left hover:bg-soft" onClick={() => go(h.href)}>
              <span className="shrink-0 rounded-full bg-tint px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider">{h.kind}</span>
              <span><b>{h.title}</b><br /><small className="text-mute">{h.sub}</small></span>
            </button>
          )) : <div className="px-3 py-2 text-sm text-mute">No matches</div>}
        </div>
      )}
    </div>
  );
}

function QuickAdd({ dept }: { dept: Dept }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState(false);
  const [slug, setSlug] = useState('');
  const box = useRef<HTMLDivElement>(null);
  useOutside(box, () => setOpen(false));
  const services = servicesOf(dept);
  const item = 'block w-full cursor-pointer rounded-xl px-3 py-2 text-left hover:bg-soft';
  return (
    <>
      <div ref={box} className="relative">
        <button className="btn-pri" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}>+ Quick add ▾</button>
        {open && (
          <div role="menu" className="absolute right-0 top-[calc(100%+8px)] z-30 min-w-[180px] rounded-2xl border-[1.5px] border-edge bg-card p-1.5 shadow-2xl">
            <button className={item} onClick={() => { setOpen(false); router.push(route(dept, 'vouchers')); }}>+ Voucher</button>
            <button className={item} onClick={() => { setOpen(false); router.push(route(dept, 'crm', { new: 1 })); }}>+ Lead</button>
            <button className={item} onClick={() => { setOpen(false); router.push(route(dept, 'ledgers', { new: 1 })); }}>+ Ledger</button>
            <button className={item} onClick={() => { setOpen(false); if (dept === 'marketing') router.push(route(dept, 'clients', { new: 1 })); else { setSlug(services[0].slug); setPick(true); } }}>+ Client</button>
          </div>
        )}
      </div>
      <Modal open={pick} onClose={() => setPick(false)}>
        <form method="dialog" onSubmit={(e) => { e.preventDefault(); setPick(false); router.push(route(dept, `services/${slug}`, { new: 1 })); }}>
          <h3 className="m-0 text-lg font-bold">Add client — which service?</h3>
          <label className="lbl">Service</label>
          <select className="inp" value={slug} onChange={(e) => setSlug(e.target.value)}>
            {services.map((s) => <option key={s.slug} value={s.slug}>{s.label}</option>)}
          </select>
          <ModalActions onCancel={() => setPick(false)} saveLabel="Continue" />
        </form>
      </Modal>
    </>
  );
}

function Alerts({ dept }: { dept: Dept }) {
  const d = useData();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useOutside(box, () => setOpen(false));
  const list = useMemo(() => alertsFor(d, dept), [d, dept]);
  return (
    <div ref={box} className="relative">
      <button className="relative size-[38px] cursor-pointer rounded-full border-[1.5px] border-edge bg-card text-base shadow-[0_3px_0_var(--color-edge)]" onClick={() => setOpen((o) => !o)} aria-label={`Alerts (${list.length})`}>
        🔔
        {list.length > 0 && <em className="absolute -right-1.5 -top-1.5 h-[18px] min-w-[18px] rounded-full bg-brand px-1 text-[11px] font-extrabold not-italic leading-[18px] text-white">{list.length}</em>}
      </button>
      {open && (
        <div className="absolute right-0 top-[calc(100%+8px)] z-30 max-h-[70vh] w-[min(340px,90vw)] overflow-auto rounded-2xl border-[1.5px] border-edge bg-card p-1.5 shadow-2xl">
          {list.length ? list.map((a, i) => (
            <button key={i} className="flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2 text-left hover:bg-soft" onClick={() => { setOpen(false); router.push(a.href); }}>
              <span className="rounded-full bg-bad/15 px-2 py-0.5 text-[10px] font-extrabold text-bad">!</span>
              <span><b>{a.title}</b><br /><small className="text-mute">{a.sub}</small></span>
            </button>
          )) : <div className="px-3 py-2 text-sm text-mute">Nothing needs attention 🎉</div>}
        </div>
      )}
    </div>
  );
}

export default function AppShell({ dept, children }: { dept: Dept; children: ReactNode }) {
  const hydrated = useHydrated();
  const pathname = usePathname();
  const pwa = usePwa();
  const [menu, setMenu] = useState(false);
  const [date, setDate] = useState('');
  useEffect(() => setDate(new Date().toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })), []);
  useEffect(() => setMenu(false), [pathname]);

  return (
    <div className="min-h-screen">
      <aside className={cx('fixed inset-y-0 left-0 z-40 w-[250px] border-r-[3px] border-edge bg-white shadow-[6px_0_24px_rgba(31,41,55,.08)] transition-transform lg:translate-x-0', menu ? 'translate-x-0' : '-translate-x-full')}>
        <Sidebar dept={dept} onNavigate={() => setMenu(false)} />
      </aside>
      {menu && <button aria-label="Close menu" className="fixed inset-0 z-30 bg-black/30 lg:hidden" onClick={() => setMenu(false)} />}
      <div className="lg:ml-[250px]">
        <header className="topbar sticky top-0 z-20 flex flex-wrap items-center gap-3 border-b-[1.5px] border-line bg-page/85 px-4 py-3.5 backdrop-blur lg:px-8">
          <button className="btn-sec !px-3 lg:hidden" onClick={() => setMenu(true)} aria-label="Open menu">☰</button>
          <GlobalSearch />
          <span className="flex-1" />
          {!pwa.online && <span className="rounded-full bg-warn/15 px-3 py-1 text-xs font-bold text-warn">Offline — working from this device</span>}
          <QuickAdd dept={dept} />
          <Alerts dept={dept} />
          <div className="inline-flex overflow-hidden rounded-full border-[1.5px] border-edge bg-card shadow-[0_3px_0_var(--color-edge)]" role="tablist" aria-label="Department">
            {DEPTS.map((x) => (
              <Link key={x} href={route(x, 'dashboard')} role="tab" aria-selected={x === dept}
                className={cx('px-4 py-2 font-bold', x === dept ? 'bg-brand text-white shadow-[inset_0_-3px_0_var(--color-brand-dark)]' : 'text-ink hover:bg-soft')}>
                {DEPT_LABEL[x]}
              </Link>
            ))}
          </div>
          {date && <span className="hidden whitespace-nowrap rounded-full bg-brand px-3.5 py-1.5 text-[13px] font-semibold text-white shadow-[0_4px_0_var(--color-brand-dark)] xl:inline">{date}</span>}
        </header>
        {pwa.updateReady && (
          <div className="mx-4 mt-3 flex items-center gap-3 rounded-xl border-[1.5px] border-brand bg-brand-soft px-4 py-2.5 lg:mx-8">
            <span className="flex-1">A new version of the app is ready.</span>
            <button className="btn-pri btn-xs" onClick={pwa.applyUpdate}>Update now</button>
          </div>
        )}
        <main className="px-4 pb-10 pt-2.5 lg:px-8">
          {hydrated ? <div key={pathname} className="rise">{children}</div> : <div className="p-10 text-center text-mute">Loading your books…</div>}
        </main>
      </div>
    </div>
  );
}
