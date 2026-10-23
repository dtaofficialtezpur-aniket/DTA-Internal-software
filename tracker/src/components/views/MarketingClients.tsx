'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { saveMarketingClient, toggleMarketingStatus } from '@/lib/actions';
import { route } from '@/lib/routes';
import { useData } from '@/lib/store';
import { inr } from '@/lib/utils';
import { Empty, Field, Modal, ModalActions, PageHeader, Pill, Toolbar } from '../ui';
import { useToast } from '../Providers';

export function MarketingClientsView() {
  const d = useData();
  const router = useRouter();
  const sp = useSearchParams();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState(sp.get('q') ?? '');
  const [f, setF] = useState({ name: '', service: '', fee: '' });
  useEffect(() => { setQ(sp.get('q') ?? ''); }, [sp]);
  useEffect(() => { if (sp.get('new')) { setOpen(true); router.replace(route('marketing', 'clients')); } }, [sp, router]);
  useEffect(() => { if (open) setF({ name: '', service: '', fee: '' }); }, [open]);

  const all = useMemo(() => d.clients.filter((c) => c.type === 'marketing'), [d.clients]);
  const list = all.filter((c) => !q.trim() || (c.name + ' ' + (c.service ?? '')).toLowerCase().includes(q.trim().toLowerCase()));
  const mrr = all.filter((c) => c.status === 'active').reduce((t, c) => t + (c.fee ?? 0), 0);

  return (
    <>
      <PageHeader title="Digital Marketing · Clients" sub={<>Clients, services and monthly retainers · MRR {inr(mrr)}</>} />
      <Toolbar>
        <input aria-label="Search clients" className="inp !max-w-[260px]" placeholder="Search clients" value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="flex-1" />
        <button className="btn-pri" onClick={() => setOpen(true)}>+ Add client</button>
      </Toolbar>
      <div className="card overflow-x-auto">
        {all.length === 0 ? (
          <Empty title="No marketing clients yet" hint="Add a client with their service and monthly fee to track retainers and renewals.">
            <button className="btn-pri" onClick={() => setOpen(true)}>+ Add client</button>
          </Empty>
        ) : (
          <table className="tbl">
            <thead><tr><th>Client</th><th>Service</th><th>Status</th><th>Next due</th><th className="r">Monthly fee</th><th /></tr></thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.id}>
                  <td><b>{c.name}</b></td><td>{c.service}</td><td><Pill tone={c.status === 'active' ? 'active' : 'paused'}>{c.status}</Pill></td>
                  <td>{c.due}</td><td className="r">{inr(c.fee ?? 0)}</td>
                  <td><button className="btn-sec btn-xs" onClick={() => toggleMarketingStatus(c.id)}>{c.status === 'active' ? 'Pause' : 'Resume'}</button></td>
                </tr>
              ))}
              {!list.length && <tr><td colSpan={6} className="text-mute">No clients match your search.</td></tr>}
            </tbody>
          </table>
        )}
      </div>
      <Modal open={open} onClose={() => setOpen(false)}>
        <form onSubmit={(e) => { e.preventDefault(); if (!f.name.trim()) { toast('Enter the client’s name'); return; } saveMarketingClient({ name: f.name.trim(), service: f.service.trim(), fee: Number(f.fee) || 0 }); toast('Client saved'); setOpen(false); }}>
          <h3 className="m-0 text-lg font-bold">Add Digital Marketing client</h3>
          <Field label="Name"><input className="inp" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus /></Field>
          <Field label="Service"><input className="inp" placeholder="e.g. Social media + Ads" value={f.service} onChange={(e) => setF({ ...f, service: e.target.value })} /></Field>
          <Field label="Monthly fee (₹)"><input className="inp" type="number" min="0" value={f.fee} onChange={(e) => setF({ ...f, fee: e.target.value })} /></Field>
          <ModalActions onCancel={() => setOpen(false)} />
        </form>
      </Modal>
    </>
  );
}
