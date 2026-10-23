'use client';
import { useEffect, useState } from 'react';
import { GROUPS } from '@/lib/constants';
import { saveLedger } from '@/lib/actions';
import type { Dept, Ledger } from '@/lib/types';
import { Modal, ModalActions } from '../ui';
import { useToast } from '../Providers';

/** Create / alter a ledger (Tally: "Ledger Creation"). */
export function LedgerFormModal({ open, dept, ledger, onClose, onSaved }: { open: boolean; dept: Dept; ledger?: Ledger | null; onClose: () => void; onSaved?: (name: string) => void }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [group, setGroup] = useState('Indirect Expenses');
  const [amt, setAmt] = useState('');
  const [side, setSide] = useState<'Dr' | 'Cr'>('Dr');
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!open) return;
    setName(ledger?.name ?? '');
    setGroup(ledger?.group ?? 'Indirect Expenses');
    setAmt(ledger && ledger.open ? String(Math.abs(ledger.open)) : '');
    setSide(ledger && ledger.open < 0 ? 'Cr' : 'Dr');
    setErr('');
  }, [open, ledger]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const open_ = (Number(amt) || 0) * (side === 'Cr' ? -1 : 1);
    const error = saveLedger(dept, { id: ledger?.id, name, group, open: open_ });
    if (error) { setErr(error); return; }
    toast('Ledger saved');
    onSaved?.(name.trim());
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose}>
      <form onSubmit={submit}>
        <h3 className="m-0 text-lg font-bold">{ledger ? 'Alter' : 'Create'} ledger</h3>
        <label className="lbl" htmlFor="lg-name">Name</label>
        <input id="lg-name" className="inp" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        <label className="lbl" htmlFor="lg-group">Under (group)</label>
        <select id="lg-group" className="inp" value={group} onChange={(e) => setGroup(e.target.value)}>{GROUPS.map((g) => <option key={g}>{g}</option>)}</select>
        <label className="lbl" htmlFor="lg-open">Opening balance (₹)</label>
        <div className="flex gap-2">
          <input id="lg-open" className="inp" type="number" step="0.01" min="0" value={amt} onChange={(e) => setAmt(e.target.value)} />
          <select aria-label="Dr or Cr" className="inp !w-24" value={side} onChange={(e) => setSide(e.target.value as 'Dr' | 'Cr')}><option>Dr</option><option>Cr</option></select>
        </div>
        {err && <p role="alert" className="mt-2 text-sm text-bad">{err}</p>}
        <ModalActions onCancel={onClose} />
      </form>
    </Modal>
  );
}
