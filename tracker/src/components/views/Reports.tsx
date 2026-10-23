'use client';
import { DEPT_LABEL } from '@/lib/constants';
import { balanceSheet, profitLoss, trialBalance, type ReportGroup } from '@/lib/books';
import { useData } from '@/lib/store';
import type { Dept } from '@/lib/types';
import { m2 } from '@/lib/utils';
import { PageHeader } from '../ui';

function Side({ title, groups, extra, total, totalTone }: { title: string; groups: ReportGroup[]; extra?: { label: string; amount: number; tone: string } | null; total: number; totalTone?: string }) {
  return (
    <div className="card">
      <b>{title}</b>
      <div className="mt-2">
        {groups.map((g) => (
          <div key={g.group}>
            <div className="border-t border-line py-1.5 font-bold first:border-t-0">{g.group}</div>
            {g.items.map((i) => (
              <div key={i.ledger.id} className="flex justify-between py-0.5 pl-4"><span>{i.ledger.name}</span><span>{m2(i.amount)}</span></div>
            ))}
          </div>
        ))}
        {!groups.length && <p className="text-sm text-mute">None</p>}
        {extra && <div className="flex justify-between border-t border-line py-2"><b>{extra.label}</b><b className={extra.tone}>{m2(extra.amount)}</b></div>}
        <div className="flex justify-between border-t-2 border-edge py-2"><b>Total</b><b className={totalTone}>{m2(total)}</b></div>
      </div>
    </div>
  );
}

export function TrialBalanceView({ dept }: { dept: Dept }) {
  const d = useData();
  const T = trialBalance(d, dept);
  return (
    <>
      <PageHeader title={`${DEPT_LABEL[dept]} · Trial Balance`} sub="Closing balance of every ledger. Debit total must equal credit total." />
      <div className="card overflow-x-auto">
        <table className="tbl">
          <thead><tr><th>Particulars</th><th className="r">Debit (₹)</th><th className="r">Credit (₹)</th></tr></thead>
          <tbody>
            {T.groups.map((g) => (
              <FragmentRows key={g.group} title={g.group}>
                {g.rows.map((r) => <tr key={r.ledger.id}><td className="!pl-6">{r.ledger.name}</td><td className="r">{r.dr ? m2(r.dr) : ''}</td><td className="r">{r.cr ? m2(r.cr) : ''}</td></tr>)}
              </FragmentRows>
            ))}
            {!T.groups.length && <tr><td colSpan={3} className="text-mute">No balances yet — enter a voucher or give a ledger an opening balance.</td></tr>}
            <tr className="font-bold"><td className="r">Grand total</td><td className="r">{m2(T.dr)}</td><td className="r">{m2(T.cr)}</td></tr>
          </tbody>
        </table>
        {T.balanced ? <p className="mt-2 text-good">✓ Books are balanced</p> : <p role="alert" className="mt-2 text-bad">Difference in books: ₹{m2(Math.abs(T.dr - T.cr))}</p>}
      </div>
    </>
  );
}
const FragmentRows = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <>
    <tr><td colSpan={3}><b>{title}</b></td></tr>
    {children}
  </>
);

export function ProfitLossView({ dept }: { dept: Dept }) {
  const d = useData();
  const P = profitLoss(d, dept);
  return (
    <>
      <PageHeader title={`${DEPT_LABEL[dept]} · Profit & Loss A/c`} sub="Expenses on the left, incomes on the right (like Tally)." />
      <div className="grid gap-3.5 md:grid-cols-2">
        <Side title="Expenses" groups={P.expenses} extra={P.net >= 0 ? { label: 'Net Profit', amount: P.net, tone: 'text-good' } : null} total={P.total} />
        <Side title="Incomes" groups={P.incomes} extra={P.net < 0 ? { label: 'Net Loss', amount: -P.net, tone: 'text-bad' } : null} total={P.total} />
      </div>
    </>
  );
}

export function BalanceSheetView({ dept }: { dept: Dept }) {
  const d = useData();
  const B = balanceSheet(d, dept);
  return (
    <>
      <PageHeader title={`${DEPT_LABEL[dept]} · Balance Sheet`} sub="Liabilities on the left, assets on the right (like Tally). Net profit is added to the capital side." />
      <div className="grid gap-3.5 md:grid-cols-2">
        <Side title="Liabilities" groups={B.liabilities} extra={B.net >= 0 && B.net !== 0 ? { label: 'Profit & Loss A/c', amount: B.net, tone: '' } : null} total={B.liabilityTotal} />
        <Side title="Assets" groups={B.assets} extra={B.net < 0 ? { label: 'Profit & Loss A/c (loss)', amount: -B.net, tone: '' } : null} total={B.assetTotal} />
      </div>
      {B.balanced ? <p className="mt-2.5 text-good">✓ Balance sheet tallies</p> : <p role="alert" className="mt-2.5 text-bad">Difference: ₹{m2(Math.abs(B.liabilityTotal - B.assetTotal))}</p>}
    </>
  );
}
