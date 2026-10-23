'use client';
import { useState, type ReactNode } from 'react';
import { MONTHS, PAN_STATUSES, PAN_TYPES } from '@/lib/constants';
import { setGst, setGstTogether, setItr, setPan, setTdsMonth, setTdsQuarter } from '@/lib/actions';
import {
  currentFY, currentYear, fyMonths, lowerPill, monthFil, monthKey, panInfo, panState, qDue, qFil, qLabel, retSt, tdsMon, tdsMonSt, tdsQSt, yearFil,
} from '@/lib/filings';
import { useData } from '@/lib/store';
import type { Client } from '@/lib/types';
import { Modal, Pill } from '../ui';

const Sel = ({ value, options, onChange, label }: { value: string; options: string[]; onChange: (v: string) => void; label: string }) => (
  <select aria-label={label} className="inp !w-auto !py-1.5" value={value} onChange={(e) => onChange(e.target.value)}>
    {options.map((o) => <option key={o}>{o}</option>)}
  </select>
);
const Line = ({ label, sub, children }: { label: string; sub?: string; children: ReactNode }) => (
  <div className="my-1 flex items-center gap-2"><span className="flex-1">{label} {sub && <span className="text-mute">{sub}</span>}</span>{children}</div>
);
const Box = ({ title, children }: { title: string; children: ReactNode }) => (
  <div className="mb-2 rounded-xl border-[1.5px] border-edge bg-card px-3 py-2.5"><b className="mb-1.5 block">{title}</b>{children}</div>
);
const Nav = ({ label, onPrev, onNext }: { label: string; onPrev: () => void; onNext: () => void }) => (
  <div className="my-2 flex items-center gap-2.5">
    <button className="btn-sec" onClick={onPrev} aria-label="Previous">‹</button><b>{label}</b><button className="btn-sec" onClick={onNext} aria-label="Next">›</button>
  </div>
);
function GstBody({ c }: { c: Client }) {
  const d = useData();
  const [year, setYear] = useState(currentYear());
  const together = d.settings.gstTogether;
  return (
    <>
      <h3 className="m-0 text-lg font-bold">GST filing — {c.name}</h3>
      <p className="mb-2 text-sm text-mute">GSTR-1 (Sales) is due on the <b>11th</b> and GSTR-3B (Purchase) on the <b>20th</b> of each month. Anything left Pending after its due date shows Overdue automatically.</p>
      <div className="mb-2 flex flex-wrap items-center gap-2.5">
        <button className="btn-sec" onClick={() => setYear(year - 1)} aria-label="Previous year">‹</button><b>{year}</b><button className="btn-sec" onClick={() => setYear(year + 1)} aria-label="Next year">›</button>
        <span className="flex-1" />
        <label className="flex cursor-pointer items-center gap-2 text-[13px]"><input type="checkbox" checked={together} onChange={(e) => setGstTogether(e.target.checked)} /> Fill GSTR-1 and GSTR-3B together</label>
      </div>
      {MONTHS.map((name, i) => {
        const key = monthKey(year, i + 1);
        const f = monthFil(c, key);
        return (
          <Box key={key} title={`${name} ${year}`}>
            {([['gstr1', 'GSTR-1 (Sales)', 11], ['gstr3b', 'GSTR-3B (Purchase)', 20]] as const).map(([k, l, due]) => (
              <Line key={k} label={l} sub={`due ${due}th`}>
                <Sel label={`${name} ${l}`} value={f[k]} options={['Filed', 'Pending', 'N/A']} onChange={(v) => setGst(c.id, key, k, v)} />
                <Pill tone={retSt(f[k], year, i, due)} />
              </Line>
            ))}
            <Line label="Client payment">
              <Sel label={`${name} client payment`} value={f.payment} options={['Paid', 'Unpaid']} onChange={(v) => setGst(c.id, key, 'payment', v)} />
              <Pill tone={lowerPill(f.payment)} />
            </Line>
          </Box>
        );
      })}
    </>
  );
}

function ItrBody({ c }: { c: Client }) {
  const base = currentYear();
  return (
    <>
      <h3 className="m-0 text-lg font-bold">ITR filing — {c.name}</h3>
      <p className="mb-2 text-sm text-mute">ITR is tracked year-wise. Individual / non-audit returns are usually due by <b>31 July</b>, audit cases by <b>31 October</b> — confirm the date for this client.</p>
      {[0, 1, 2, 3, 4, 5].map((k) => {
        const y = base - k;
        const f = yearFil(c, y);
        return (
          <Box key={y} title={`FY ${y - 1}-${String(y).slice(-2)} (AY ${y}-${String(y + 1).slice(-2)})`}>
            <Line label="ITR filing status">
              <Sel label={`FY ${y - 1} filing status`} value={f.filed} options={['Filed', 'Pending', 'N/A']} onChange={(v) => setItr(c.id, y, 'filed', v)} />
              <Pill tone={lowerPill(f.filed)} />
            </Line>
            <Line label="Client payment">
              <Sel label={`FY ${y - 1} client payment`} value={f.payment} options={['Paid', 'Unpaid']} onChange={(v) => setItr(c.id, y, 'payment', v)} />
              <Pill tone={lowerPill(f.payment)} />
            </Line>
          </Box>
        );
      })}
    </>
  );
}

function TdsBody({ c }: { c: Client }) {
  const [fy, setFy] = useState(currentFY());
  return (
    <>
      <h3 className="m-0 text-lg font-bold">TDS filing — {c.name}</h3>
      <p className="mb-2 text-sm text-mute">TDS deducted must be deposited (challan) by the <b>7th</b> of the next month. Quarterly returns ({c.detail || '24Q / 26Q'}) are due <b>31 Jul, 31 Oct, 31 Jan and 31 May</b>. Anything left Pending after its due date shows Overdue.</p>
      <Nav label={`FY ${fy}-${String(fy + 1).slice(-2)}`} onPrev={() => setFy(fy - 1)} onNext={() => setFy(fy + 1)} />
      <b>Quarterly TDS returns</b>
      <div className="mt-1.5">
        {[1, 2, 3, 4].map((q) => {
          const f = qFil(c, fy, q);
          const u = qDue(fy, q);
          return (
            <Box key={q} title={qLabel(fy, q)}>
              <Line label="TDS return" sub={`due ${u[2]} ${MONTHS[u[1]].slice(0, 3)} ${u[0]}`}>
                <Sel label={`${qLabel(fy, q)} return`} value={f.ret} options={['Filed', 'Pending', 'N/A']} onChange={(v) => setTdsQuarter(c.id, fy, q, 'ret', v)} />
                <Pill tone={tdsQSt(c, fy, q)} />
              </Line>
              <Line label="Client payment">
                <Sel label={`${qLabel(fy, q)} client payment`} value={f.fee} options={['Paid', 'Unpaid']} onChange={(v) => setTdsQuarter(c.id, fy, q, 'fee', v)} />
                <Pill tone={lowerPill(f.fee)} />
              </Line>
            </Box>
          );
        })}
      </div>
      <b className="mt-2 block">Monthly TDS payment (challan)</b>
      <div className="mt-1.5">
        {fyMonths(fy).map((m) => (
          <Box key={m.key} title={`${m.name} ${m.y}`}>
            <Line label="Deposit" sub={`due 7 ${MONTHS[(m.mi + 1) % 12].slice(0, 3)}`}>
              <Sel label={`${m.name} ${m.y} challan`} value={tdsMon(c, m.key).pay} options={['Paid', 'Pending', 'N/A']} onChange={(v) => setTdsMonth(c.id, m.key, v)} />
              <Pill tone={tdsMonSt(c, m.key)} />
            </Line>
          </Box>
        ))}
      </div>
    </>
  );
}

function PanBody({ c }: { c: Client }) {
  const p = panInfo(c);
  const inp = (f: string, type: string, label: string) => (
    <label className="block"><span className="lbl">{label}</span><input type={type} className="inp" defaultValue={p[f as keyof typeof p]} key={`${f}-${p[f as keyof typeof p]}`} onBlur={(e) => { if (e.target.value !== p[f as keyof typeof p]) setPan(c.id, f, e.target.value); }} /></label>
  );
  const sel = (f: string, opts: string[], label: string) => (
    <label className="block"><span className="lbl">{label}</span><select className="inp" value={p[f as keyof typeof p]} onChange={(e) => setPan(c.id, f, e.target.value)}>{opts.map((o) => <option key={o}>{o}</option>)}</select></label>
  );
  return (
    <>
      <h3 className="m-0 text-lg font-bold">PAN application — {c.name}</h3>
      <p className="mb-2 text-sm text-mute">Track the application from start to delivery.</p>
      <div className="grid gap-x-3 sm:grid-cols-2">
        {sel('type', PAN_TYPES, 'Application type')}{inp('ack', 'text', 'Acknowledgement no.')}
        {inp('applied', 'date', 'Applied on')}{sel('status', PAN_STATUSES, 'Application status')}
        {inp('delivered', 'date', 'Delivered on')}{sel('payment', ['Paid', 'Unpaid'], 'Client payment')}
      </div>
      <div className="mt-3 flex gap-2"><Pill tone={panState(c)}>{p.status}</Pill><Pill tone={lowerPill(p.payment)} /></div>
    </>
  );
}

/** One modal for every kind of filing tracker; `clientId` null = closed. */
export function FilingModal({ clientId, onClose }: { clientId: number | null; onClose: () => void }) {
  const d = useData();
  const c = clientId ? d.clients.find((x) => x.id === clientId) : undefined;
  return (
    <Modal open={!!c} onClose={onClose} wide>
      {c && (
        <>
          {c.service === 'GST' && <GstBody c={c} />}
          {c.service === 'ITR' && <ItrBody c={c} />}
          {c.service === 'TDS' && <TdsBody c={c} />}
          {c.service === 'PAN' && <PanBody c={c} />}
          <div className="sticky bottom-0 mt-3 flex justify-end bg-card pt-2"><button className="btn-pri" onClick={onClose}>Close</button></div>
        </>
      )}
    </Modal>
  );
}
