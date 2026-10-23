'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { CLIENT_STATUSES, DEPT_LABEL, serviceBySlug, type ServiceDef } from '@/lib/constants';
import { deleteClient, genSerial, saveCatalogClient, setClientPayment, setClientStatus, type ClientFields } from '@/lib/actions';
import { accState, gstState, itrState, lowerPill, monthFil, panInfo, panState, prevMonthKey, prevQuarter, qFil, tdsMonSt, tdsQSt, thisMonthKey, yearFil, currentYear } from '@/lib/filings';
import { route } from '@/lib/routes';
import { getState, useData } from '@/lib/store';
import type { Client, Dept } from '@/lib/types';
import { cx, today } from '@/lib/utils';
import { Empty, Field, Modal, ModalActions, PageHeader, Pill, Toolbar } from '../ui';
import { useToast } from '../Providers';
import { FilingModal } from './FilingModals';

async function copy(text: string) {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

function PasswordCell({ c }: { c: Client }) {
  const toast = useToast();
  const [show, setShow] = useState(false);
  return (
    <button
      className="cursor-pointer tracking-widest" aria-label={show ? 'Hide password' : 'Show and copy password'}
      onClick={async () => { const next = !show; setShow(next); if (next && c.password && (await copy(c.password))) toast('Password copied'); }}
    >
      {show ? c.password || '—' : '••••••••'}
    </button>
  );
}

const blank = (): ClientFields => ({
  name: '', businessName: '', detail: '', regNo: '', dateGiven: today(), loginId: '', password: '', status: 'Active', dueDate: '', phone: '', email: '', notes: '', serial: '',
});

function ClientFormModal({ open, dept, svc, client, onClose }: { open: boolean; dept: Dept; svc: ServiceDef; client: Client | null; onClose: () => void }) {
  const toast = useToast();
  const [f, setF] = useState<ClientFields>(blank());
  const [err, setErr] = useState('');
  useEffect(() => {
    if (!open) return;
    setErr('');
    setF(client ? { ...blank(), ...client } as ClientFields : { ...blank(), serial: genSerial(getState(), svc.name) });
  }, [open, client, svc.name]);
  const set = (k: keyof ClientFields) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const v = (k: keyof ClientFields) => (f[k] as string) ?? '';
  return (
    <Modal open={open} onClose={onClose}>
      <form onSubmit={(e) => {
        e.preventDefault();
        if (!f.name.trim()) { setErr('Enter the client’s name'); return; }
        saveCatalogClient(dept, svc.name, client?.id ?? null, { ...f, name: f.name.trim() });
        toast(client ? 'Client updated' : 'Client saved');
        onClose();
      }}>
        <h3 className="m-0 text-lg font-bold">{client ? 'Edit' : 'Add'} {svc.label} client</h3>
        <div className="grid gap-x-3 sm:grid-cols-2">
          <Field label="Serial No."><input className="inp" value={v('serial')} onChange={set('serial')} /></Field>
          <Field label="Client name"><input className="inp" value={v('name')} onChange={set('name')} autoFocus /></Field>
          <Field label="Business name"><input className="inp" value={v('businessName')} onChange={set('businessName')} /></Field>
          <Field label="Detail (sub-type)"><input className="inp" value={v('detail')} onChange={set('detail')} /></Field>
          <Field label="Date given"><input className="inp" type="date" value={v('dateGiven')} onChange={set('dateGiven')} /></Field>
          <Field label="Due / renewal date"><input className="inp" type="date" value={v('dueDate')} onChange={set('dueDate')} /></Field>
          <Field label="Reg. / License no."><input className="inp" value={v('regNo')} onChange={set('regNo')} /></Field>
          <Field label="Login ID"><input className="inp" value={v('loginId')} onChange={set('loginId')} autoComplete="off" /></Field>
          <Field label="Password"><input className="inp" value={v('password')} onChange={set('password')} autoComplete="off" /></Field>
          <Field label="Status"><select className="inp" value={v('status') || 'Active'} onChange={set('status')}>{CLIENT_STATUSES.map((s) => <option key={s}>{s}</option>)}</select></Field>
          <Field label="Phone"><input className="inp" inputMode="tel" value={v('phone')} onChange={set('phone')} /></Field>
          <Field label="Email"><input className="inp" type="email" value={v('email')} onChange={set('email')} /></Field>
          <Field label="Notes" className="sm:col-span-2"><input className="inp" value={v('notes')} onChange={set('notes')} /></Field>
        </div>
        {err && <p role="alert" className="mt-2 text-sm text-bad">{err}</p>}
        <p className="mt-2 text-xs text-mute">Passwords are stored in this browser in plain text. Don’t keep anything here you wouldn’t keep in a notebook on this device.</p>
        <ModalActions onCancel={onClose} />
      </form>
    </Modal>
  );
}

export function CatalogView({ dept, slug }: { dept: Dept; slug: string }) {
  const svc = serviceBySlug(dept, slug);
  const d = useData();
  const router = useRouter();
  const sp = useSearchParams();
  const toast = useToast();
  const [q, setQ] = useState(sp.get('q') ?? '');
  const [statusF, setStatusF] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [filingId, setFilingId] = useState<number | null>(null);

  useEffect(() => { setQ(sp.get('q') ?? ''); }, [sp]);
  useEffect(() => { if (sp.get('new')) { setEditing(null); setFormOpen(true); router.replace(route(dept, `services/${slug}`)); } }, [sp, dept, slug, router]);

  const all = useMemo(() => d.clients.filter((c) => c.type === dept && c.service === svc?.name), [d.clients, dept, svc]);
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return all
      .filter((c) => (!statusF || c.status === statusF) && (!t || [c.name, c.businessName, c.serial, c.phone, c.loginId, c.regNo, c.detail, c.email, c.notes].join(' ').toLowerCase().includes(t)))
      .reverse();
  }, [all, q, statusF]);

  if (!svc) return <p className="p-8 text-mute">Service not found.</p>;
  const kind = svc.kind;
  const [pfy, pq] = prevQuarter();
  const todayStr = today();

  const exportJson = () => {
    if (!all.length) { toast('No records to export yet'); return; }
    const blob = new Blob([JSON.stringify({ exportedOn: new Date().toISOString(), department: DEPT_LABEL[dept], service: svc.name, count: all.length, records: all }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `DTA-${dept}-${svc.slug}-clients.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast(`Exported ${all.length} record${all.length > 1 ? 's' : ''} as JSON`);
  };
  const openLogin = async (c: Client) => {
    const ok = await copy(c.loginId || '');
    toast(ok ? `Login ID copied — opening the ${svc.label} portal` : `Login ID: ${c.loginId || '—'}`);
    window.open(svc.portalUrl, '_blank', 'noopener');
  };
  const extraHead = kind === 'gst' ? ['This month', 'Payment'] : kind === 'itr' ? ['This year', 'Payment'] : kind === 'tds' ? ['Challan · Return', 'Payment'] : kind === 'pan' ? ['Application', 'Payment'] : ['Payment'];

  return (
    <>
      <PageHeader title={`${DEPT_LABEL[dept]} · ${svc.label} clients`} sub={`Separate catalog for ${svc.label}. Passwords: click a cell to show it and copy it.`} />
      <Toolbar>
        <input aria-label="Search clients" className="inp !min-w-[260px] !w-auto" placeholder="Search name, serial no., phone, login ID, detail…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select aria-label="Filter by status" className="inp !w-auto" value={statusF} onChange={(e) => setStatusF(e.target.value)}>
          <option value="">All statuses</option>{CLIENT_STATUSES.map((s) => <option key={s}>{s}</option>)}
        </select>
        <span className="flex-1" />
        <button className="btn-sec" onClick={exportJson}>Export JSON</button>
        <button className="btn-pri" onClick={() => { setEditing(null); setFormOpen(true); }}>+ Add client</button>
      </Toolbar>

      <div className="card overflow-x-auto">
        {all.length === 0 ? (
          <Empty title={`No ${svc.label} clients yet`} hint="Add your first client to start tracking filings, renewals and payments.">
            <button className="btn-pri" onClick={() => { setEditing(null); setFormOpen(true); }}>+ Add client</button>
          </Empty>
        ) : (
          <>
            <table className="tbl tbl-compact">
              <thead>
                <tr>
                  <th>S.No.</th><th>Client</th><th>Phone</th><th>Detail</th><th>Reg. / License no.</th><th>Date given</th><th>Login ID</th><th>Password</th><th>Status</th><th>Due / renewal</th>
                  {extraHead.map((h) => <th key={h}>{h}</th>)}<th />
                </tr>
              </thead>
              <tbody>
                {list.map((c) => {
                  const overdue = !!c.dueDate && c.dueDate < todayStr && c.status !== 'Completed';
                  return (
                    <tr key={c.id}>
                      <td className="whitespace-nowrap">{c.serial}</td>
                      <td className="wrap"><b>{c.name}</b>{c.businessName && <div className="text-mute">{c.businessName}</div>}</td>
                      <td>{c.phone ? <a className="text-brand-dark underline" href={`tel:${c.phone}`}>{c.phone}</a> : '—'}</td>
                      <td>{c.detail || '—'}</td><td>{c.regNo || '—'}</td><td className="whitespace-nowrap">{c.dateGiven || '—'}</td><td>{c.loginId || '—'}</td>
                      <td><PasswordCell c={c} /></td>
                      <td>
                        <select aria-label={`Status of ${c.name}`} className="inp inp-sm !w-auto" value={c.status} onChange={(e) => setClientStatus(c.id, e.target.value)}>
                          {CLIENT_STATUSES.map((s) => <option key={s}>{s}</option>)}
                        </select>
                      </td>
                      <td className="whitespace-nowrap">{c.dueDate || '—'} {overdue && <Pill tone="overdue" />}</td>
                      {kind === 'gst' && <><td><button className="btn-sec btn-xs" onClick={() => setFilingId(c.id)}><Pill tone={gstState(c)} /></button></td><td><Pill tone={lowerPill(monthFil(c, thisMonthKey()).payment)} /></td></>}
                      {kind === 'itr' && <><td><button className="btn-sec btn-xs" onClick={() => setFilingId(c.id)}><Pill tone={itrState(c)} /></button></td><td><Pill tone={lowerPill(yearFil(c, currentYear()).payment)} /></td></>}
                      {kind === 'tds' && <><td><button className="btn-sec btn-xs" onClick={() => setFilingId(c.id)}><Pill tone={tdsMonSt(c, prevMonthKey())} /> <Pill tone={tdsQSt(c, pfy, pq)} /></button></td><td><Pill tone={lowerPill(qFil(c, pfy, pq).fee)} /></td></>}
                      {kind === 'pan' && <><td><button className="btn-sec btn-xs" onClick={() => setFilingId(c.id)}><Pill tone={panState(c)}>{panInfo(c).status}</Pill></button></td><td><Pill tone={lowerPill(panInfo(c).payment)} /></td></>}
                      {kind === 'generic' && (
                        <td>
                          <select aria-label={`Payment of ${c.name}`} className="inp inp-sm !w-auto" value={c.pay || 'Unpaid'} onChange={(e) => setClientPayment(c.id, e.target.value)}><option>Paid</option><option>Unpaid</option></select>
                        </td>
                      )}
                      <td className="whitespace-nowrap">
                        {svc.portalUrl && <button className="btn-sec btn-xs" onClick={() => openLogin(c)}>Login →</button>}{' '}
                        <button className="btn-ic" title="Edit" aria-label={`Edit ${c.name}`} onClick={() => { setEditing(c); setFormOpen(true); }}>✎</button>
                        <button className="btn-ic" title="Delete" aria-label={`Delete ${c.name}`} onClick={() => { if (confirm('Delete this client record? It will be moved to Deleted, not erased.')) { deleteClient(c.id); toast('Moved to Deleted'); } }}>✕</button>
                      </td>
                    </tr>
                  );
                })}
                {!list.length && <tr><td colSpan={14} className="text-mute">No clients match your search.</td></tr>}
              </tbody>
            </table>
            <p className={cx('mt-2.5 text-sm text-mute')}>{list.length} {svc.label} client record{list.length === 1 ? '' : 's'} (of {all.length} total)</p>
          </>
        )}
      </div>

      <ClientFormModal open={formOpen} dept={dept} svc={svc} client={editing} onClose={() => setFormOpen(false)} />
      <FilingModal clientId={filingId} onClose={() => setFilingId(null)} />
    </>
  );
}
