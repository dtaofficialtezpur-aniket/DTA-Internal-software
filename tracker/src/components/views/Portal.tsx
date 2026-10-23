'use client';
import { useState } from 'react';
import { DEPT_LABEL, MONTHS, serviceLabel } from '@/lib/constants';
import { findLedgerByName, ledgerStatement } from '@/lib/books';
import { accState, currentFY, currentYear, lowerPill, monthFil, monthKey, panInfo, panState, qFil, qLabel, retSt, tdsQSt, yearFil } from '@/lib/filings';
import { useData } from '@/lib/store';
import type { Client, Dept } from '@/lib/types';
import { balTxt, inr, m2 } from '@/lib/utils';
import { Empty, Kpi, KpiGrid, PageHeader, Pill } from '../ui';

function ServiceInfo({ c }: { c: Client }) {
  const Y = currentYear();
  const FY = currentFY();
  const small = 'tbl tbl-compact';
  if (c.service === 'GST')
    return (
      <div className="mb-4 overflow-x-auto">
        <b>GST filings · {Y}</b>
        <table className={small + ' mt-1.5'}>
          <thead><tr><th>Month</th><th>GSTR-1</th><th>GSTR-3B</th><th>Payment</th></tr></thead>
          <tbody>
            {MONTHS.map((n, i) => ({ n, i, f: monthFil(c, monthKey(Y, i + 1)) })).filter((x) => x.i <= new Date().getMonth()).map((x) => (
              <tr key={x.n}><td>{x.n}</td><td><Pill tone={retSt(x.f.gstr1, Y, x.i, 11)} /></td><td><Pill tone={retSt(x.f.gstr3b, Y, x.i, 20)} /></td><td><Pill tone={lowerPill(x.f.payment)} /></td></tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  if (c.service === 'ITR')
    return (
      <div className="mb-4 overflow-x-auto">
        <b>ITR filings</b>
        <table className={small + ' mt-1.5'}>
          <thead><tr><th>Financial year</th><th>Filing</th><th>Payment</th></tr></thead>
          <tbody>{[0, 1, 2].map((k) => Y - k).map((y) => { const f = yearFil(c, y); return <tr key={y}><td>FY {y - 1}-{String(y).slice(-2)}</td><td><Pill tone={lowerPill(f.filed)} /></td><td><Pill tone={lowerPill(f.payment)} /></td></tr>; })}</tbody>
        </table>
      </div>
    );
  if (c.service === 'TDS')
    return (
      <div className="mb-4 overflow-x-auto">
        <b>TDS · FY {FY}-{String(FY + 1).slice(-2)}</b>
        <table className={small + ' mt-1.5'}>
          <thead><tr><th>Quarter</th><th>Return</th><th>Payment</th></tr></thead>
          <tbody>{[1, 2, 3, 4].map((q) => <tr key={q}><td>{qLabel(FY, q)}</td><td><Pill tone={tdsQSt(c, FY, q)} /></td><td><Pill tone={lowerPill(qFil(c, FY, q).fee)} /></td></tr>)}</tbody>
        </table>
      </div>
    );
  if (c.service === 'PAN') {
    const p = panInfo(c);
    return <div className="mb-4"><b>PAN application</b><div className="mt-1.5">{p.type} · ack {p.ack || '—'} · applied {p.applied || '—'} <Pill tone={panState(c)}>{p.status}</Pill></div></div>;
  }
  return <div className="mb-4"><b>{c.detail || serviceLabel(c.service)}</b> · due {c.dueDate || '—'} <Pill tone={accState(c)} /></div>;
}

export function PortalView({ dept }: { dept: Dept }) {
  const d = useData();
  const list = d.clients.filter((c) => c.type === dept);
  const [sel, setSel] = useState(0);
  const c = list.find((x) => x.id === sel) ?? list[0];

  if (!c)
    return (
      <>
        <PageHeader title={`${DEPT_LABEL[dept]} · Client Portal`} sub="What a client sees after logging in — pick a client to preview" />
        <div className="card"><Empty title="No clients yet" hint="Add a client first, then preview their portal here." /></div>
      </>
    );

  const L = findLedgerByName(d, dept, c.name);
  const S = L ? ledgerStatement(d, L) : { rows: [], close: 0, tcr: 0, tdr: 0 };
  const balance = Math.max(S.close, 0);

  return (
    <>
      <PageHeader title={`${DEPT_LABEL[dept]} · Client Portal`} sub="What a client sees after logging in — pick a client to preview" />
      <select aria-label="Client" className="inp mb-3 !w-auto" value={c.id} onChange={(e) => setSel(Number(e.target.value))}>
        {list.map((x) => <option key={x.id} value={x.id}>{x.name}{x.service && x.type !== 'marketing' ? ` (${serviceLabel(x.service)})` : ''}</option>)}
      </select>
      <div className="card">
        <h3 className="m-0 mb-1 text-lg font-bold">Welcome, {c.name}</h3>
        <p className="mb-3.5 text-sm text-mute">
          {c.type === 'marketing' ? <>Plan: {c.service} · {inr(c.fee ?? 0)}/month · next due {c.due}</> : <>Service: {serviceLabel(c.service)}{c.detail ? ` · ${c.detail}` : ''} · status: {accState(c)}</>}
        </p>
        <KpiGrid><Kpi label="Paid so far" value={inr(S.tcr)} tone="good" /><Kpi label="Balance due" value={inr(balance)} tone={balance ? 'warn' : 'good'} /></KpiGrid>
        {c.type !== 'marketing' && <ServiceInfo c={c} />}
        <b>Statement of account</b>
        <div className="mt-1.5 overflow-x-auto">
          <table className="tbl">
            <thead><tr><th>Date</th><th>Particulars</th><th className="r">Debit</th><th className="r">Credit</th><th className="r">Balance</th></tr></thead>
            <tbody>
              {S.rows.map((r) => (
                <tr key={r.v.id}><td className="whitespace-nowrap">{r.v.date}</td><td>{r.v.type} {r.v.no}{r.v.narr ? ` · ${r.v.narr}` : ''}</td><td className="r">{r.dr ? m2(r.dr) : ''}</td><td className="r">{r.cr ? m2(r.cr) : ''}</td><td className="r">{balTxt(r.bal)}</td></tr>
              ))}
              {!S.rows.length && <tr><td colSpan={5} className="text-mute">No entries yet</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
