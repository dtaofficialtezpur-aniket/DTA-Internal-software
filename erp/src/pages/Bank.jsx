import { useRef, useState } from 'react';
import { useStore } from '../lib/store.jsx';
import { money, date, daysBetween, downloadCsv, nowIso, toCsv, uid } from '../lib/format.js';
import { postReceipt } from '../lib/ops.js';
import { Empty, Field, Icon, Modal, PageHead, Stat, Tabs } from '../components/ui.jsx';

const CATEGORIES = ['Supplier payment', 'Salary', 'Rent / utilities', 'Bank charges', 'Owner drawing', 'Transfer between accounts', 'Other income', 'Other expense'];
const WINDOW_DAYS = 5;

// Non-cash money the books say reached the bank: customer receipts and bank/UPI/cheque payments taken at billing.
export function bookEntries(db) {
  const out = [];
  for (const r of db.receipts) if (r.mode !== 'cash') out.push({ id: 'rc:' + r.id, date: r.date, amount: r.amount, ref: r.ref || '', desc: `${r.no} · ${db.customers.find((c) => c.id === r.customerId)?.name || ''}`, mode: r.mode });
  for (const i of db.invoices) {
    if (i.cancelled) continue;
    i.payments.forEach((p, k) => { if (!p.at && ['upi', 'bank', 'cheque'].includes(p.mode)) out.push({ id: `ip:${i.id}:${k}`, date: i.date, amount: p.amount, ref: p.ref || '', desc: `${i.no} · ${i.customerName}`, mode: p.mode }); });
  }
  return out;
}

function parseDate(s) {
  s = String(s).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) return `${m[3].length === 2 ? '20' + m[3] : m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  const d = new Date(s);
  return isNaN(d) ? '' : d.toISOString().slice(0, 10);
}

function splitCsv(line) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
    else if (ch === '"') q = true; else if (ch === ',') { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

// Reads common Indian bank CSV layouts: Date, Narration/Description, Ref/Cheque no., Withdrawal/Debit, Deposit/Credit.
export function parseStatement(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const hi = lines.findIndex((l) => /date/i.test(l) && /(credit|deposit|cr)/i.test(l));
  if (hi < 0) throw new Error('Could not find a header row with Date and Credit/Deposit columns.');
  const h = splitCsv(lines[hi]).map((c) => c.toLowerCase());
  const col = (re) => h.findIndex((c) => re.test(c));
  const ci = { date: col(/date/), desc: col(/narration|description|particular|remark/), ref: col(/ref|chq|cheque|utr/), dr: col(/withdraw|debit|^dr/), cr: col(/deposit|credit|^cr/) };
  const n = (v) => Number(String(v || '').replace(/[,₹\s]/g, '')) || 0;
  return lines.slice(hi + 1).map((l) => splitCsv(l)).map((c) => ({
    date: parseDate(c[ci.date]), desc: c[ci.desc] || '', ref: ci.ref >= 0 ? c[ci.ref] : '', debit: n(c[ci.dr]), credit: n(c[ci.cr]),
  })).filter((r) => r.date && (r.debit || r.credit));
}

export function autoMatch(db) {
  const used = new Set(db.bankLines.map((l) => l.matchId).filter(Boolean));
  const book = bookEntries(db).filter((b) => !used.has(b.id));
  let count = 0;
  for (const line of db.bankLines) {
    if (line.status !== 'unmatched' || !line.credit) continue;
    const cands = book.filter((b) => !used.has(b.id) && Math.abs(b.amount - line.credit) < 0.5 && Math.abs(daysBetween(b.date, line.date + 'T12:00:00')) <= WINDOW_DAYS);
    // Prefer a reference that appears in the narration, then the closest date.
    cands.sort((a, b) => (Number(!!b.ref && line.desc.includes(b.ref)) - Number(!!a.ref && line.desc.includes(a.ref))) ||
      Math.abs(daysBetween(a.date, line.date + 'T12:00:00')) - Math.abs(daysBetween(b.date, line.date + 'T12:00:00')));
    if (cands[0]) { Object.assign(line, { matchId: cands[0].id, status: 'matched', how: 'auto' }); used.add(cands[0].id); count++; }
  }
  return count;
}

function sampleStatement(db) {
  const book = bookEntries(db).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 18);
  const rows = book.map((b, i) => {
    const d = new Date(b.date); d.setDate(d.getDate() + (i % 3));
    const ref = b.ref || `${b.mode === 'upi' ? 'UPI' : 'NEFT'}${String(400000 + i * 7919).slice(0, 6)}`;
    return [d.toISOString().slice(0, 10), `${b.mode === 'upi' ? 'UPI/CR/' : 'NEFT CR-'}${ref}-${b.desc.split(' · ')[1] || ''}`.toUpperCase(), ref, '', b.amount];
  });
  const t = new Date().toISOString().slice(0, 10);
  rows.push([t, 'NEFT CR-UNKNOWN PARTY', 'N998877', '', 25000], [t, 'CASH DEPOSIT BY SELF', '', '', 150000],
    [t, 'RTGS DR-NORTH EAST ISPAT DISTRIBUTORS', 'R44556', 450000, ''], [t, 'SALARY TRF OCT', '', 152000, ''], [t, 'SMS/ACCOUNT CHARGES', '', 59, '']);
  return toCsv([['Txn Date', 'Narration', 'Ref No', 'Withdrawal', 'Deposit'], ...rows]);
}

export default function Bank() {
  const { db, update, toast } = useStore();
  const [tab, setTab] = useState('unmatched');
  const [pick, setPick] = useState(null);
  const file = useRef();
  const lines = db.bankLines;
  const matchedIds = new Set(lines.map((l) => l.matchId).filter(Boolean));
  const notInBank = bookEntries(db).filter((b) => !matchedIds.has(b.id) && daysBetween(b.date) > 3 && lines.length && b.date.slice(0, 10) >= (lines.reduce((m, l) => (l.date < m ? l.date : m), '9999')));
  const stat = (s) => lines.filter((l) => l.status === s);
  const shown = tab === 'all' ? lines : tab === 'unmatched' ? stat('unmatched') : tab === 'books' ? [] : lines.filter((l) => l.status !== 'unmatched');

  const importText = (text, name) => {
    let rows;
    try { rows = parseStatement(text); } catch (e) { return toast(e.message, 'bad'); }
    const { added, auto } = update((d) => {
      const seen = new Set(d.bankLines.map((l) => `${l.date}|${l.desc}|${l.debit}|${l.credit}`));
      let added = 0;
      for (const r of rows) {
        const k = `${r.date}|${r.desc}|${r.debit}|${r.credit}`;
        if (seen.has(k)) continue;
        seen.add(k); added++;
        d.bankLines.push({ id: uid('bl'), ...r, status: 'unmatched', imported: nowIso() });
      }
      return { added, auto: autoMatch(d) };
    }, ['Imported bank statement', 'Bank', `${name} · ${rows.length} lines`]);
    toast(`${added} new line(s) imported${added < rows.length ? ` (${rows.length - added} already present)` : ''} · ${auto} matched automatically`);
  };

  return (
    <div className="page">
      <PageHead title="Bank Reconciliation" sub="Import the bank statement; receipts and bill payments are matched automatically">
        <button className="btn" onClick={() => { const blob = new Blob([sampleStatement(db)], { type: 'text/csv' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'sample-bank-statement.csv'; a.click(); }}><Icon name="download" />Sample format</button>
        <button className="btn" onClick={() => importText(sampleStatement(db), 'Sample statement')}><Icon name="refresh" />Load demo statement</button>
        <button className="btn primary" onClick={() => file.current.click()}><Icon name="download" style={{ transform: 'rotate(180deg)' }} />Import CSV</button>
        <input ref={file} type="file" accept=".csv,text/csv" hidden onChange={(e) => { const f = e.target.files[0]; if (f) f.text().then((t) => importText(t, f.name)); e.target.value = ''; }} />
      </PageHead>
      <div className="grid g4 stagger">
        <Stat label="Statement lines" value={lines.length} money={false} icon="bank" />
        <Stat label="Matched" value={stat('matched').length + stat('categorised').length} money={false} sub={lines.length ? `${Math.round((stat('matched').length + stat('categorised').length) / lines.length * 100)}% reconciled` : ''} icon="check" tone="green" />
        <Stat label="Unmatched in bank" value={stat('unmatched').length} money={false} sub={money(stat('unmatched').reduce((s, l) => s + l.credit - l.debit, 0)) + ' net'} icon="alert" tone={stat('unmatched').length ? 'red' : ''} />
        <Stat label="In books, not in bank" value={notInBank.length} money={false} sub={money(notInBank.reduce((s, b) => s + b.amount, 0))} icon="clock" tone="gold" />
      </div>
      <div className="card mt">
        <div className="card-head wrap">
          <Tabs value={tab} onChange={setTab} items={[['unmatched', `To reconcile (${stat('unmatched').length})`], ['done', 'Reconciled'], ['books', `In books only (${notInBank.length})`], ['all', 'All lines']]} />
          {stat('unmatched').length > 0 && <button className="btn sm" onClick={() => { const n = update((d) => autoMatch(d), ['Auto-matched bank lines', 'Bank', '']); toast(`${n} more matched`); }}><Icon name="refresh" />Run auto-match</button>}
        </div>
        {tab === 'books' ? (
          <div className="table-wrap"><table className="t">
            <thead><tr><th>Date</th><th>Entry</th><th>Mode</th><th>Ref</th><th className="num">Amount</th></tr></thead>
            <tbody>{notInBank.map((b) => <tr key={b.id}><td>{date(b.date)}</td><td>{b.desc}</td><td style={{ textTransform: 'uppercase' }}>{b.mode}</td><td className="mono">{b.ref || '—'}</td><td className="num">{money(b.amount)}</td></tr>)}</tbody>
          </table>{!notInBank.length && <Empty icon="check" text="Every bank receipt in the books appears in the statement." />}
            <p className="small muted card-body">Usually cheques not yet cleared or UPI settled to a different account. Check these with the bank.</p></div>
        ) : (
          <div className="table-wrap"><table className="t">
            <thead><tr><th>Date</th><th>Narration</th><th className="num">Debit</th><th className="num">Credit</th><th>Status</th><th /></tr></thead>
            <tbody>{shown.slice().sort((a, b) => b.date.localeCompare(a.date)).map((l) => {
              const b = l.matchId && bookEntries(db).find((x) => x.id === l.matchId);
              return (
                <tr key={l.id}><td style={{ whiteSpace: 'nowrap' }}>{date(l.date)}</td><td className="small">{l.desc}{l.ref && <div className="muted mono">{l.ref}</div>}</td>
                  <td className="num" style={{ color: 'var(--bad)' }}>{l.debit ? money(l.debit) : ''}</td><td className="num" style={{ color: 'var(--ok)' }}>{l.credit ? money(l.credit) : ''}</td>
                  <td className="small">{l.status === 'matched' ? <><span className="badge ok">Matched{l.how === 'auto' ? ' · auto' : ''}</span><div className="muted">{b?.desc}</div></> : l.status === 'categorised' ? <span className="badge blue">{l.category}</span> : <span className="badge warn">Unmatched</span>}</td>
                  <td className="right">{l.status === 'unmatched' ? <button className="btn sm primary" onClick={() => setPick(l)}>Reconcile</button>
                    : <button className="btn sm ghost" onClick={() => update((d) => { Object.assign(d.bankLines.find((x) => x.id === l.id), { status: 'unmatched', matchId: null, category: null, how: null }); }, ['Unmatched bank line', 'Bank', `${l.desc} ${money(l.credit || l.debit)}`])}>Undo</button>}</td></tr>
              );
            })}</tbody>
          </table>{!shown.length && <Empty icon="bank" text={lines.length ? 'Nothing here.' : 'Import a bank statement (CSV) to begin, or load the demo statement.'} />}</div>
        )}
      </div>
      {pick && <ReconcileModal line={pick} onClose={() => setPick(null)} />}
      <button className="btn sm ghost mt" onClick={() => downloadCsv('bank-reconciliation.csv', [['Date', 'Narration', 'Ref', 'Debit', 'Credit', 'Status', 'Matched to / category'], ...lines.map((l) => [l.date, l.desc, l.ref, l.debit, l.credit, l.status, l.category || bookEntries(db).find((x) => x.id === l.matchId)?.desc || ''])])}><Icon name="download" />Export reconciliation</button>
    </div>
  );
}

function ReconcileModal({ line, onClose }) {
  const { db, user, update, toast } = useStore();
  const used = new Set(db.bankLines.map((l) => l.matchId).filter(Boolean));
  const amt = line.credit || line.debit;
  const cands = line.credit ? bookEntries(db).filter((b) => !used.has(b.id) && Math.abs(b.amount - amt) < 0.5).sort((a, b) => Math.abs(daysBetween(a.date, line.date + 'T12:00:00')) - Math.abs(daysBetween(b.date, line.date + 'T12:00:00'))) : [];
  const [cat, setCat] = useState(line.credit ? 'Other income' : 'Supplier payment');
  const [cust, setCust] = useState('');
  const set = (patch, label) => {
    update((d) => { Object.assign(d.bankLines.find((x) => x.id === line.id), patch); }, [label, 'Bank', `${line.desc} · ${money(amt)}`]);
    toast('Reconciled'); onClose();
  };
  const receipt = () => {
    if (!cust) return;
    update((d) => {
      const rc = postReceipt(d, { customerId: cust, amount: line.credit, mode: 'bank', ref: line.ref || line.desc.slice(0, 30), userId: user.id });
      Object.assign(d.bankLines.find((x) => x.id === line.id), { status: 'matched', matchId: 'rc:' + rc.id, how: 'receipt' });
    }, ['Receipt from bank line', 'Bank', `${db.customers.find((c) => c.id === cust)?.name} · ${money(line.credit)}`]);
    toast('Receipt created and matched'); onClose();
  };
  return (
    <Modal wide title={`Reconcile ${money(amt)} ${line.credit ? 'credit' : 'debit'}`} onClose={onClose}>
      <div className="alert info"><Icon name="bank" /><div>{date(line.date)} · {line.desc} {line.ref && `· ${line.ref}`}</div></div>
      {line.credit > 0 && <>
        <h3 className="mt" style={{ marginBottom: 8 }}>Match to an entry in the books</h3>
        {cands.length ? <table className="t"><tbody>{cands.slice(0, 8).map((b) => (
          <tr key={b.id}><td>{date(b.date)}</td><td>{b.desc}</td><td style={{ textTransform: 'uppercase' }}>{b.mode}</td><td className="num">{money(b.amount)}</td>
            <td className="right"><button className="btn sm primary" onClick={() => set({ status: 'matched', matchId: b.id, how: 'manual' }, 'Matched bank line')}>Match</button></td></tr>
        ))}</tbody></table> : <p className="small muted">No unmatched entry of {money(amt)} in the books.</p>}
        <h3 className="mt" style={{ marginBottom: 8 }}>Or record it as a customer payment</h3>
        <div className="row"><select className="input grow" value={cust} onChange={(e) => setCust(e.target.value)}><option value="">Choose customer…</option>{db.customers.filter((c) => c.id !== 'walkin').map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          <button className="btn primary" disabled={!cust} onClick={receipt}>Create receipt</button></div>
      </>}
      <h3 className="mt" style={{ marginBottom: 8 }}>{line.credit ? 'Or categorise it' : 'Categorise this payment'}</h3>
      <div className="row"><Field label="Category"><select className="input" value={cat} onChange={(e) => setCat(e.target.value)}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
        <button className="btn" style={{ alignSelf: 'flex-end' }} onClick={() => set({ status: 'categorised', category: cat }, 'Categorised bank line')}>Save category</button></div>
    </Modal>
  );
}

