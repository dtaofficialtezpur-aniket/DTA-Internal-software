'use client';
import { useEffect, useRef, type ReactNode } from 'react';
import type { PillTone } from '@/lib/types';
import { cx } from '@/lib/utils';

const TONE: Record<PillTone, string> = {
  filed: 'bg-good/15 text-good', paid: 'bg-good/15 text-good', active: 'bg-good/15 text-good',
  pending: 'bg-warn/15 text-warn', paused: 'bg-warn/15 text-warn',
  overdue: 'bg-bad/15 text-bad', unpaid: 'bg-bad/15 text-bad',
  na: 'bg-tint text-mute', upcoming: 'bg-tint text-mute',
  today: 'bg-brand/15 text-brand-dark',
};

export function Pill({ tone, children }: { tone: PillTone; children?: ReactNode }) {
  return (
    <span className={cx('inline-block rounded-full px-2.5 py-0.5 text-xs font-bold shadow-[0_2px_0_rgba(0,0,0,0.06)]', TONE[tone])}>
      {children ?? (tone === 'na' ? 'N/A' : tone)}
    </span>
  );
}

export function PageHeader({ title, sub, children }: { title: ReactNode; sub?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-4">
      <h2 className="mb-0.5 mt-1.5 text-[26px] font-bold leading-tight tracking-tight text-brand-dark">{title}</h2>
      {sub && <p className="text-sm text-mute">{sub}</p>}
      {children}
    </div>
  );
}

export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="mb-3 flex flex-wrap items-center gap-2.5">{children}</div>;
}
export const Spacer = () => <span className="flex-1" />;

export function Kpi({ label, value, tone }: { label: string; value: ReactNode; tone?: 'good' | 'bad' | 'warn' }) {
  return (
    <div className="card transition hover:-translate-y-0.5" style={{ background: 'linear-gradient(180deg,#fff,var(--color-soft))' }}>
      <div className="text-xs font-bold uppercase tracking-wide text-mute">{label}</div>
      <div className={cx('mt-1.5 text-[28px] font-extrabold leading-tight', tone === 'good' ? 'text-good' : tone === 'bad' ? 'text-bad' : tone === 'warn' ? 'text-warn' : 'text-brand')}>
        {value}
      </div>
    </div>
  );
}

export function KpiGrid({ children }: { children: ReactNode }) {
  return <div className="mb-4 grid gap-3.5" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))' }}>{children}</div>;
}

export function Seg<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex overflow-hidden rounded-full border-[1.5px] border-edge bg-card shadow-[0_3px_0_var(--color-edge)]">
      {options.map(([k, l]) => (
        <button
          key={k} type="button" onClick={() => onChange(k)}
          className={cx('cursor-pointer px-4 py-1.5 font-bold transition', value === k ? 'bg-brand text-white shadow-[inset_0_-3px_0_var(--color-brand-dark)]' : 'text-ink hover:bg-soft')}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

export function Empty({ title, hint, children }: { title: string; hint?: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-1.5 px-4 py-10 text-center">
      <div className="text-base font-bold text-ink">{title}</div>
      {hint && <div className="max-w-md text-sm text-mute">{hint}</div>}
      {children && <div className="mt-2 flex flex-wrap justify-center gap-2">{children}</div>}
    </div>
  );
}

export function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={cx('block', className)}>
      <span className="lbl">{label}</span>
      {children}
    </label>
  );
}

/** Modal built on the native <dialog> element: focus trapping, Esc to close, backdrop. */
export function Modal({ open, onClose, children, wide }: { open: boolean; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className={cx('modal', wide && '!w-[min(760px,95vw)]')}
      onClose={onClose}
      onClick={(e) => { if (e.target === ref.current) onClose(); }}
    >
      {open && children}
    </dialog>
  );
}

export function ModalActions({ onCancel, saveLabel = 'Save', onSave }: { onCancel: () => void; saveLabel?: string; onSave?: () => void }) {
  return (
    <div className="mt-5 flex justify-end gap-2.5">
      <button type="button" className="btn-sec" onClick={onCancel}>Cancel</button>
      <button type={onSave ? 'button' : 'submit'} className="btn-pri" onClick={onSave}>{saveLabel}</button>
    </div>
  );
}

export function Notes({ children }: { children: ReactNode }) {
  return <div className="mb-4 rounded-xl border-[1.5px] border-dashed border-edge bg-soft px-3.5 py-2.5">{children}</div>;
}

export function Row({ left, right }: { left: ReactNode; right: ReactNode }) {
  return <div className="flex items-center justify-between gap-2 border-t border-line py-2 first:border-t-0"><span>{left}</span><span className="whitespace-nowrap font-bold">{right}</span></div>;
}
