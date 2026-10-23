'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { DEPT_LABEL, LEAD_SERVICES, LEAD_SOURCES, STAGES } from '@/lib/constants';
import { addLead, convertLead, setLeadStage, updateLead } from '@/lib/actions';
import { followUp } from '@/lib/leads';
import { route } from '@/lib/routes';
import { useData } from '@/lib/store';
import type { Dept, Lead, LeadStage } from '@/lib/types';
import { addDays, cx, inr, today } from '@/lib/utils';
import { Field, Kpi, KpiGrid, Modal, ModalActions, PageHeader, Pill, Toolbar } from '../ui';
import { useToast } from '../Providers';

function AddLeadModal({ open, dept, onClose }: { open: boolean; dept: Dept; onClose: () => void }) {
  const toast = useToast();
  const services = LEAD_SERVICES[dept];
  const [f, setF] = useState({ name: '', phone: '', source: LEAD_SOURCES[0], service: services[0], value: '', next: addDays(2), note: '' });
  useEffect(() => { if (open) setF({ name: '', phone: '', source: LEAD_SOURCES[0], service: services[0], value: '', next: addDays(2), note: '' }); }, [open, services]);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal open={open} onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); if (!f.name.trim()) { toast('Enter the lead’s name'); return; } addLead(dept, { ...f, value: Number(f.value) || 0 }); toast('Lead added'); onClose(); }}>
        <h3 className="m-0 text-lg font-bold">Add lead · {DEPT_LABEL[dept]}</h3>
        <Field label="Name"><input className="inp" value={f.name} onChange={set('name')} autoFocus /></Field>
        <Field label="Phone"><input className="inp" inputMode="tel" value={f.phone} onChange={set('phone')} /></Field>
        <Field label="Source"><select className="inp" value={f.source} onChange={set('source')}>{LEAD_SOURCES.map((s) => <option key={s}>{s}</option>)}</select></Field>
        <Field label="Service wanted"><select className="inp" value={f.service} onChange={set('service')}>{services.map((s) => <option key={s}>{s}</option>)}</select></Field>
        <Field label="Expected fee (₹)"><input className="inp" type="number" min="0" value={f.value} onChange={set('value')} /></Field>
        <Field label="Next follow-up"><input className="inp" type="date" value={f.next} onChange={set('next')} /></Field>
        <Field label="Note"><input className="inp" value={f.note} onChange={set('note')} /></Field>
        <ModalActions onCancel={onClose} />
      </form>
    </Modal>
  );
}

function LeadModal({ lead, onClose }: { lead: Lead | null; onClose: () => void }) {
  const toast = useToast();
  const d = useData();
  const [stage, setStage] = useState<LeadStage>('new');
  const [next, setNext] = useState('');
  const [note, setNote] = useState('');
  useEffect(() => { if (lead) { setStage(lead.stage); setNext(lead.next || ''); setNote(''); } }, [lead]);
  const cur = lead ? d.leads.find((l) => l.id === lead.id) ?? lead : null;
  const clientName = cur?.cid ? d.clients.find((c) => c.id === cur.cid)?.name : '';
  return (
    <Modal open={!!lead} onClose={onClose}>
      {cur && (
        <form onSubmit={(e) => { e.preventDefault(); updateLead(cur.id, { stage, next, note: note.trim() }); toast('Lead updated'); onClose(); }}>
          <h3 className="m-0 text-lg font-bold">{cur.name}</h3>
          <p className="text-sm text-mute">{cur.phone} · {cur.service} · {inr(cur.value)} · {cur.source}</p>
          <Field label="Stage"><select className="inp" value={stage} onChange={(e) => setStage(e.target.value as LeadStage)}>{STAGES.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></Field>
          <Field label="Next follow-up"><input className="inp" type="date" value={next} onChange={(e) => setNext(e.target.value)} /></Field>
          <Field label="Add note"><input className="inp" placeholder="What happened on this call / message?" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          <div className="mt-2 max-h-[150px] overflow-auto text-sm">
            {[...cur.notes].reverse().map((n, i) => <div key={i} className="border-t border-line py-1.5"><span className="text-mute">{n.d}</span> {n.t}</div>)}
            {!cur.notes.length && <p className="text-mute">No notes yet</p>}
          </div>
          <div className="mt-3">
            {cur.cid ? <Pill tone="paid">✓ Converted to client: {clientName}</Pill>
              : <button type="button" className="btn-sec" onClick={() => { convertLead(cur.id); toast('Converted to a client'); onClose(); }}>Convert to client</button>}
          </div>
          <ModalActions onCancel={onClose} />
        </form>
      )}
    </Modal>
  );
}

export function CrmView({ dept }: { dept: Dept }) {
  const d = useData();
  const router = useRouter();
  const sp = useSearchParams();
  const [q, setQ] = useState(sp.get('q') ?? '');
  const [adding, setAdding] = useState(false);
  const [openLead, setOpenLead] = useState<Lead | null>(null);
  const [over, setOver] = useState<LeadStage | null>(null);

  useEffect(() => { setQ(sp.get('q') ?? ''); }, [sp]);
  useEffect(() => { if (sp.get('new')) { setAdding(true); router.replace(route(dept, 'crm')); } }, [sp, dept, router]);

  const all = useMemo(() => d.leads.filter((l) => l.dept === dept), [d.leads, dept]);
  const open = all.filter((l) => l.stage !== 'won' && l.stage !== 'lost');
  const due = open.filter((l) => ['overdue', 'today'].includes(followUp(l))).sort((a, b) => a.next.localeCompare(b.next));
  const month = today().slice(0, 7);
  const won = all.filter((l) => l.stage === 'won' && (l.wonOn ?? '').startsWith(month));
  const shown = all.filter((l) => !q.trim() || (l.name + ' ' + l.phone).toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <>
      <PageHeader title={`${DEPT_LABEL[dept]} · CRM`} sub={`Leads and follow-ups for ${DEPT_LABEL[dept]} only`} />
      <KpiGrid>
        <Kpi label="Open leads" value={open.length} />
        <Kpi label="Pipeline value" value={inr(open.reduce((t, l) => t + l.value, 0))} />
        <Kpi label="Won this month" value={won.length} tone="good" />
        <Kpi label="Follow-ups due" value={due.length} tone={due.length ? 'bad' : 'good'} />
      </KpiGrid>

      {due.length > 0 && (
        <div className="card mb-3.5">
          <b>Follow-ups due</b>
          {due.map((l) => (
            <button key={l.id} className="flex w-full cursor-pointer items-center justify-between gap-2 border-t border-line py-2 text-left first:mt-1.5" onClick={() => setOpenLead(l)}>
              <span><b>{l.name}</b> <span className="text-mute">· {l.phone} · {l.service}</span></span>
              <span><Pill tone={followUp(l) as 'overdue' | 'today'} /> <span className="text-mute">{l.next}</span></span>
            </button>
          ))}
        </div>
      )}

      <Toolbar>
        <input aria-label="Search leads" className="inp !max-w-[260px]" placeholder="Search name or phone" value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="flex-1" />
        <button className="btn-pri" onClick={() => setAdding(true)}>+ Add lead</button>
      </Toolbar>

      {all.length === 0 ? (
        <div className="card text-center text-mute"><p className="py-8">No leads yet. Add your first enquiry — you can drag it across the board as it progresses, and convert it to a client when it’s won.</p></div>
      ) : (
        <div className="grid grid-cols-5 gap-2.5 overflow-x-auto pb-2 [&>*]:min-w-[200px]">
          {STAGES.map(([k, name]) => {
            const col = shown.filter((l) => l.stage === k);
            return (
              <div
                key={k}
                className={cx('min-h-[140px] rounded-2xl border-[1.5px] border-dashed p-2', over === k ? 'border-brand bg-brand-soft' : 'border-edge bg-soft')}
                onDragOver={(e) => { e.preventDefault(); setOver(k); }}
                onDragLeave={() => setOver(null)}
                onDrop={(e) => { e.preventDefault(); setOver(null); const id = Number(e.dataTransfer.getData('text/plain')); if (id) setLeadStage(id, k); }}
              >
                <div className="mb-2 flex items-baseline justify-between gap-1.5"><b>{name}</b><span className="text-xs text-mute">{col.length} · {inr(col.reduce((t, l) => t + l.value, 0))}</span></div>
                {col.map((l) => {
                  const f = followUp(l);
                  return (
                    <div
                      key={l.id} draggable role="button" tabIndex={0}
                      onDragStart={(e) => e.dataTransfer.setData('text/plain', String(l.id))}
                      onClick={() => setOpenLead(l)}
                      onKeyDown={(e) => { if (e.key === 'Enter') setOpenLead(l); }}
                      className="mb-2 cursor-pointer rounded-xl border-[1.5px] border-edge bg-card p-2.5 shadow-[0_2px_0_var(--color-edge)] transition hover:-translate-y-0.5 hover:shadow-lg"
                    >
                      <b>{l.name}</b>
                      <div className="mb-1.5 mt-0.5 text-sm text-mute">{l.service} · {l.source}</div>
                      <div className="flex items-center justify-between gap-1.5"><b>{inr(l.value)}</b>{f && <Pill tone={f} />}</div>
                      {l.cid && <div className="mt-1 text-sm text-mute">✓ converted to client</div>}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
      {all.length > 0 && <p className="mt-1.5 text-sm text-mute">Tip: drag a card to another column to change its stage, or click a card to open it.</p>}

      <AddLeadModal open={adding} dept={dept} onClose={() => setAdding(false)} />
      <LeadModal lead={openLead} onClose={() => setOpenLead(null)} />
    </>
  );
}
