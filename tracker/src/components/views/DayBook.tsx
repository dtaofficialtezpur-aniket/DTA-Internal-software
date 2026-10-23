'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { DEPT_LABEL, VOUCHER_TYPES } from '@/lib/constants';
import { sortVouchers, vouchersOf } from '@/lib/books';
import { deleteVoucher } from '@/lib/actions';
import { route } from '@/lib/routes';
import { useData } from '@/lib/store';
import type { Dept } from '@/lib/types';
import { Empty, PageHeader, Toolbar } from '../ui';
import { useToast } from '../Providers';
import { VoucherTable } from './VoucherTable';

export function DayBookView({ dept }: { dept: Dept }) {
  const d = useData();
  const router = useRouter();
  const toast = useToast();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [type, setType] = useState('');
  const all = vouchersOf(d, dept);
  const list = useMemo(
    () => sortVouchers(all).filter((x) => (!from || x.date >= from) && (!to || x.date <= to) && (!type || x.type === type)),
    [all, from, to, type],
  );
  return (
    <>
      <PageHeader title={`${DEPT_LABEL[dept]} · Day Book`} sub="Every voucher, oldest first. Use ✎ to alter a voucher or ✕ to delete it." />
      <Toolbar>
        <label className="text-sm text-mute" htmlFor="db-from">From</label>
        <input id="db-from" type="date" className="inp !w-auto" value={from} onChange={(e) => setFrom(e.target.value)} />
        <label className="text-sm text-mute" htmlFor="db-to">To</label>
        <input id="db-to" type="date" className="inp !w-auto" value={to} onChange={(e) => setTo(e.target.value)} />
        <select aria-label="Voucher type" className="inp !w-auto" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">All voucher types</option>
          {VOUCHER_TYPES.map((v) => <option key={v.type}>{v.type}</option>)}
        </select>
        <span className="flex-1" />
        <Link href={route(dept, 'vouchers')} className="btn-pri">+ New voucher</Link>
      </Toolbar>
      <div className="card overflow-x-auto">
        {all.length === 0 ? (
          <Empty title="No vouchers yet" hint="Vouchers you enter appear here, day by day.">
            <Link href={route(dept, 'vouchers')} className="btn-pri">Enter your first voucher</Link>
          </Empty>
        ) : (
          <>
            <VoucherTable
              d={d} list={list}
              onEdit={(v) => router.push(route(dept, 'vouchers', { edit: v.id }))}
              onDelete={(v) => { if (confirm('Delete this voucher?')) { deleteVoucher(v.id); toast('Voucher deleted'); } }}
            />
            <p className="mt-2.5 text-sm text-mute">{list.length} voucher{list.length === 1 ? '' : 's'}</p>
          </>
        )}
      </div>
    </>
  );
}
