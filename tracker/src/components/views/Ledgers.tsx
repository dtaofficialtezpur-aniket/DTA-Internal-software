'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { DEPT_LABEL, GROUPS, STARTER_LEDGERS } from '@/lib/constants';
import { closingMap, ledgerStatement, ledgersOf } from '@/lib/books';
import { addStarterLedgers, deleteLedger } from '@/lib/actions';
import { route } from '@/lib/routes';
import { useData } from '@/lib/store';
import type { Dept, Ledger } from '@/lib/types';
import { balTxt, m2 } from '@/lib/utils';
import { Empty, PageHeader, Toolbar } from '../ui';
import { useToast } from '../Providers';
import { LedgerFormModal } from './LedgerForm';

export function LedgersView({ dept }: { dept: Dept }) {
  const d = useData();
  const router = useRouter();
  const sp = useSearchParams();
  const toast = useToast();
  const id = Number(sp.get('id')) || 0;
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<Ledger | null>(null);

  useEffect(() => {
    if (sp.get('new')) { setEditing(null); setModal(true); router.replace(route(dept, 'ledgers')); }
  }, [sp, dept, router]);

  const cl = useMemo(() => closingMap(d, dept), [d, dept]);
  const list = useMemo(
    () => [...ledgersOf(d, dept)].sort((a, b) => GROUPS.indexOf(a.group) - GROUPS.indexOf(b.group) || a.name.localeCompare(b.name)),
    [d, dept],
  );
  const open = id ? d.ledgers.find((l) => l.id === id && l.dept === dept) : undefined;

  if (open) {
    const S = ledgerStatement(d, open);
    return (
      <>
        <PageHeader title={`${DEPT_LABEL[dept]} · ${open.name}`} sub={`Ledger account · under ${open.group} · opening ${balTxt(open.open || 0)}`} />
        <Toolbar>
          <button className="btn-sec" onClick={() => router.push(route(dept, 'ledgers'))}>‹ All ledgers</button>
          <span className="flex-1" />
          <Link href={route(dept, 'vouchers')} className="btn-pri">+ New voucher</Link>
        </Toolbar>
        <div className="card overflow-x-auto">
          <table className="tbl">
            <thead><tr><th>Date</th><th>Particulars</th><th>Vch type</th><th>Vch no.</th><th className="r">Debit</th><th className="r">Credit</th><th className="r">Balance</th></tr></thead>
            <tbody>
              <tr><td /><td><i>Opening balance</i></td><td /><td /><td /><td /><td className="r">{balTxt(open.open || 0)}</td></tr>
              {S.rows.map((r) => (
                <tr key={r.v.id}>
                  <td className="whitespace-nowrap">{r.v.date}</td><td>{r.others}</td><td>{r.v.type}</td><td>{r.v.no}</td>
                  <td className="r">{r.dr ? m2(r.dr) : ''}</td><td className="r">{r.cr ? m2(r.cr) : ''}</td><td className="r">{balTxt(r.bal)}</td>
                </tr>
              ))}
              <tr className="font-bold"><td colSpan={4} className="r">Total</td><td className="r">{m2(S.tdr)}</td><td className="r">{m2(S.tcr)}</td><td /></tr>
              <tr className="font-bold"><td colSpan={6} className="r">Closing balance</td><td className="r">{balTxt(S.close)}</td></tr>
            </tbody>
          </table>
        </div>
      </>
    );
  }

  const onlyCash = list.length <= 1;
  return (
    <>
      <PageHeader title={`${DEPT_LABEL[dept]} · Ledgers`} sub="Click a ledger to see its account. Client ledgers are created automatically under Sundry Debtors." />
      <Toolbar>
        <span className="flex-1" />
        {onlyCash && <button className="btn-sec" onClick={() => { addStarterLedgers(dept, STARTER_LEDGERS[dept]); toast('Suggested ledgers added'); }}>Add suggested ledgers</button>}
        <button className="btn-pri" onClick={() => { setEditing(null); setModal(true); }}>+ Create ledger</button>
      </Toolbar>
      <div className="card overflow-x-auto">
        {onlyCash && <Empty title="Only the Cash ledger exists" hint="Create the ledgers you need (bank, capital, income, expenses) or add a suggested starter set for this department." />}
        <table className="tbl">
          <thead><tr><th>Ledger</th><th>Under</th><th className="r">Opening</th><th className="r">Closing</th><th /></tr></thead>
          <tbody>
            {list.map((l) => (
              <tr key={l.id}>
                <td><Link className="font-semibold text-brand-dark hover:underline" href={route(dept, 'ledgers', { id: l.id })}>{l.name}</Link></td>
                <td>{l.group}</td><td className="r">{balTxt(l.open || 0)}</td><td className="r">{balTxt(cl.get(l.id) ?? 0)}</td>
                <td className="whitespace-nowrap">
                  <button className="btn-ic" title="Alter" aria-label={`Alter ${l.name}`} onClick={() => { setEditing(l); setModal(true); }}>✎</button>
                  <button className="btn-ic" title="Delete" aria-label={`Delete ${l.name}`} onClick={() => { const e = deleteLedger(l.id) ; if (e) toast(e); }}>✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <LedgerFormModal open={modal} dept={dept} ledger={editing} onClose={() => setModal(false)} />
    </>
  );
}
