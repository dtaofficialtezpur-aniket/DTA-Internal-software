'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { DEPT_LABEL, VOUCHER_TYPES } from '@/lib/constants';
import {
  closingMap, findLedgerByName, ledgersOf, newVoucherForm, nextVoucherNo, voucherToForm, type VForm, type VRow,
} from '@/lib/books';
import { saveVoucher } from '@/lib/actions';
import { route } from '@/lib/routes';
import { useData } from '@/lib/store';
import type { Dept, VoucherType } from '@/lib/types';
import { balTxt, cx, m2, today } from '@/lib/utils';
import { LedgerFormModal } from './LedgerForm';
import { PageHeader, Pill } from '../ui';
import { useToast } from '../Providers';

export function VoucherEntryView({ dept }: { dept: Dept }) {
  const d = useData();
  const router = useRouter();
  const sp = useSearchParams();
  const toast = useToast();
  const editParam = Number(sp.get('edit')) || 0;
  const [form, setForm] = useState<VForm>(() => newVoucherForm(d, dept, 'Payment', today()));
  const [err, setErr] = useState('');
  const [ledgerModal, setLedgerModal] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const focusRow = useRef<number | null>(null);
  const formRef = useRef(form);
  formRef.current = form;

  // open a voucher for alteration (?edit=id)
  useEffect(() => {
    if (!editParam) return;
    const v = d.vouchers.find((x) => x.id === editParam && x.dept === dept);
    if (v) { setForm(voucherToForm(d, v)); setErr(''); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editParam, dept]);

  const ledgers = useMemo(() => ledgersOf(d, dept), [d, dept]);
  const cashBank = ledgers.filter((l) => l.group === 'Cash-in-hand' || l.group === 'Bank Accounts');
  const cl = useMemo(() => closingMap(d, dept), [d, dept]);
  const single = form.mode === 'single';
  const no = form.editId ? d.vouchers.find((x) => x.id === form.editId)?.no : nextVoucherNo(d, dept, form.type);
  const acctLedger = findLedgerByName(d, dept, form.acct);

  const totals = useMemo(() => {
    const amt = (r: VRow) => Number(r.a) || 0;
    const dr = form.rows.filter((r) => r.s === 'Dr').reduce((t, r) => t + amt(r), 0);
    const cr = form.rows.filter((r) => r.s === 'Cr').reduce((t, r) => t + amt(r), 0);
    return { dr, cr, all: form.rows.reduce((t, r) => t + amt(r), 0) };
  }, [form.rows]);

  const setType = (t: VoucherType) => {
    if (formRef.current.editId) { toast('Finish altering this voucher, or press Clear'); return; }
    const f = formRef.current;
    setForm(newVoucherForm(d, dept, t, f.date, f.narr));
    setErr('');
  };
  const clear = () => { setForm(newVoucherForm(d, dept, form.type, form.date)); setErr(''); if (editParam) router.replace(route(dept, 'vouchers')); };
  const patchRow = (i: number, p: Partial<VRow>) => setForm((f) => ({ ...f, rows: f.rows.map((r, j) => (j === i ? { ...r, ...p } : r)) }));
  const addRow = () => setForm((f) => { focusRow.current = f.rows.length; return { ...f, rows: [...f.rows, { s: 'Dr', n: '', a: '' }] }; });

  const save = () => {
    const f = formRef.current;
    const r = saveVoucher(dept, f);
    if ('error' in r) { setErr(r.error); toast(r.error); return; }
    toast(`${f.type} voucher no. ${r.no} ${r.altered ? 'altered' : 'saved'}`);
    setForm(newVoucherForm(d, dept, f.type, f.date));
    setErr('');
    if (editParam) router.replace(route(dept, 'vouchers'));
    setTimeout(() => wrap.current?.querySelector<HTMLInputElement>('input[data-first]')?.focus(), 0);
  };
  const saveRef = useRef(save);
  saveRef.current = save;

  // Tally-style keys: F4–F9 choose the voucher type, Ctrl+Enter accepts
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const vt = VOUCHER_TYPES.find((x) => x.key === e.key);
      if (vt) { e.preventDefault(); setType(vt.type); return; }
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); saveRef.current(); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dept]);

  useEffect(() => {
    if (focusRow.current != null) {
      wrap.current?.querySelector<HTMLInputElement>(`input[data-row="${focusRow.current}"]`)?.focus();
      focusRow.current = null;
    }
  }, [form.rows.length]);

  // Enter moves to the next field
  const onKeyDown = (e: React.KeyboardEvent) => {
    const t = e.target as HTMLElement;
    if (e.key !== 'Enter' || e.ctrlKey || e.metaKey || !t.matches('input,select')) return;
    const all = [...(wrap.current?.querySelectorAll<HTMLElement>('input,select,textarea,#v-save') ?? [])];
    const i = all.indexOf(t);
    setTimeout(() => all[i + 1]?.focus(), 0);
  };

  const acctLabel = { Payment: 'Account (Cr)', Receipt: 'Account (Dr)', Contra: 'From (Cr)' }[form.type as 'Payment'];
  const partLabel = form.type === 'Receipt' ? 'Cr' : 'Dr';

  return (
    <>
      <PageHeader title={`${DEPT_LABEL[dept]} · Voucher Entry`} sub={<>Double entry, like Tally. <b>F4–F9</b> change the voucher type · <b>Enter</b> moves to the next field · <b>Ctrl+Enter</b> saves.</>} />
      <div className="mb-3 flex flex-wrap gap-1.5" role="tablist" aria-label="Voucher type">
        {VOUCHER_TYPES.map(({ type, key }) => (
          <button key={type} role="tab" aria-selected={form.type === type} onClick={() => setType(type)}
            className={cx('min-w-[84px] flex-1 cursor-pointer rounded-xl border-[1.5px] px-1.5 py-2 font-semibold transition active:translate-y-0.5',
              form.type === type ? 'border-brand bg-brand text-white shadow-[0_4px_0_var(--color-brand-dark),0_8px_14px_rgba(47,91,234,.25)]' : 'border-edge bg-card text-ink shadow-[0_3px_0_var(--color-edge)] hover:bg-soft')}>
            <small className={cx('block font-bold', form.type === type ? 'text-blue-100' : 'text-mute')}>{key}</small>{type}
          </button>
        ))}
      </div>

      <div ref={wrap} className="card" onKeyDown={onKeyDown}>
        <div className="mb-3 flex flex-wrap items-end gap-7 border-b-2 border-dashed border-edge pb-3">
          <div><span className="text-xs text-mute">Voucher type</span><br /><b className="text-lg">{form.type}</b>{form.editId && <> <Pill tone="pending">altering</Pill></>}</div>
          <div><span className="text-xs text-mute">No.</span><br /><b className="text-lg">{no}</b></div>
          <div><label htmlFor="v-date" className="text-xs text-mute">Date</label><br /><input id="v-date" type="date" className="inp !w-auto" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
          <span className="flex-1" />
          <button className="btn-sec" onClick={() => setLedgerModal(true)}>+ Ledger</button>
        </div>

        {single && (
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <label htmlFor="v-acct" className="min-w-[110px] font-bold">{acctLabel}</label>
            <input id="v-acct" data-first list="dl-cb" className="inp !max-w-[320px]" placeholder="Cash / Bank ledger" value={form.acct} onChange={(e) => setForm({ ...form, acct: e.target.value })} />
            {acctLedger && <span className="text-sm text-mute">Cur Bal: {balTxt(cl.get(acctLedger.id) ?? 0)}</span>}
          </div>
        )}

        <table className="w-full">
          <thead>
            <tr className="text-left text-xs font-extrabold uppercase tracking-wide text-mute">
              {!single && <th className="w-20 px-1.5 py-1.5">Dr / Cr</th>}
              <th className="px-1.5 py-1.5">Particulars{single ? ` (${partLabel})` : ''}</th>
              <th className="w-[170px] px-1.5 py-1.5 text-right">Amount (₹)</th>
            </tr>
          </thead>
          <tbody>
            {form.rows.map((r, i) => (
              <tr key={i}>
                {!single && (
                  <td className="px-1.5 py-1">
                    <select aria-label={`Row ${i + 1} Dr or Cr`} className="inp !w-auto !py-1.5" value={r.s} onChange={(e) => patchRow(i, { s: e.target.value as 'Dr' | 'Cr' })}><option>Dr</option><option>Cr</option></select>
                  </td>
                )}
                <td className="px-1.5 py-1"><input aria-label={`Row ${i + 1} ledger`} data-row={i} data-first={!single && i === 0 ? '' : undefined} list="dl-all" className="inp !py-1.5" placeholder="Ledger name" value={r.n} onChange={(e) => patchRow(i, { n: e.target.value })} /></td>
                <td className="px-1.5 py-1"><input aria-label={`Row ${i + 1} amount`} type="number" step="0.01" min="0" className="inp !py-1.5 text-right" value={r.a} onChange={(e) => patchRow(i, { a: e.target.value })} /></td>
              </tr>
            ))}
            <tr>
              <td colSpan={single ? 1 : 2} className="px-1.5 py-1.5 text-right font-bold">Total</td>
              <td className="px-1.5 py-1.5 text-right font-bold">
                {single ? m2(totals.all) : <>Dr {m2(totals.dr)} · Cr {m2(totals.cr)} {Math.abs(totals.dr - totals.cr) > 0.004 ? <span className="text-bad">· diff {m2(Math.abs(totals.dr - totals.cr))}</span> : <span className="text-good">✓</span>}</>}
              </td>
            </tr>
          </tbody>
        </table>
        <button className="btn-sec mt-1" onClick={addRow}>+ Add line</button>

        <label htmlFor="v-narr" className="lbl !mt-4">Narration</label>
        <textarea id="v-narr" rows={2} className="inp" value={form.narr} onChange={(e) => setForm({ ...form, narr: e.target.value })} />
        <div role="alert" className="mt-1.5 min-h-5 text-bad">{err}</div>
        <div className="mt-1.5 flex gap-2.5">
          <button id="v-save" className="btn-pri" onClick={save}>Accept (Ctrl+Enter)</button>
          <button className="btn-sec" onClick={clear}>Clear</button>
        </div>
      </div>

      <datalist id="dl-cb">{cashBank.map((l) => <option key={l.id} value={l.name} />)}</datalist>
      <datalist id="dl-all">{ledgers.map((l) => <option key={l.id} value={l.name} />)}</datalist>
      <LedgerFormModal open={ledgerModal} dept={dept} onClose={() => setLedgerModal(false)} />
    </>
  );
}

