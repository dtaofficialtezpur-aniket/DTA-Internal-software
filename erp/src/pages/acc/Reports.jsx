import { useMemo, useState } from 'react';
import { useStore } from '../../lib/store.jsx';
import { allVouchers, balanceSheet, balances, drcr, groupIds, ledgerList, ledgerMap, ledgerStatement, L, num2, profitLoss, tallyXml, trialTree, VKEYS, VTYPES, voucherTotal } from '../../lib/accounts.js';
import { downloadCsv } from '../../lib/format.js';
import { localDate } from '../../lib/crmMeta.js';
import { Empty, Icon, PageHead, Search, Stat } from '../../components/ui.jsx';
import { go, initialPeriod, LedgerInput, particulars, PeriodBar, stash, TypeBadge, unstash, VoucherView } from './shared.jsx';

const fmtDate = (d) => new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
const openVoucherEdit = (v) => { stash('edit', v.id); go('accv'); };

// ---------------- Day Book ----------------
export function DayBook() {
  const { db, user } = useStore();
  const [period, setPeriod] = useState(() => { const d = JSON.parse(sessionStorage.getItem('stc-acc-day') || 'null'); sessionStorage.removeItem('stc-acc-day'); return d ? { preset: 'custom', from: d, to: d } : initialPeriod(db, 'today'); });
  const [type, setType] = useState('');
  const [q, setQ] = useState('');
  const [auto, setAuto] = useState(true);
  const [view, setView] = useState(null);
  const names = useMemo(() => ledgerMap(db), [db]);
  const rows = useMemo(() => allVouchers(db).filter((v) => v.date >= period.from && v.date <= period.to && (!type || v.type === type) && (auto || !v.auto)
    && (!q || (v.no + v.narration + particulars(v, names)).toLowerCase().includes(q.toLowerCase()))), [db, period, type, q, auto, names]);
  const cb = useMemo(() => { const ids = new Set([...groupIds(db, 'cash'), ...groupIds(db, 'bank')]); const b = balances(db, period.from, period.to); return ledgerList(db).filter((l) => ids.has(l.group)).reduce((a, l) => { const x = b.get(l.id) || {}; return { dr: a.dr + (x.dr || 0), cr: a.cr + (x.cr || 0), open: a.open + (x.open || 0), close: a.close + (x.close || 0) }; }, { dr: 0, cr: 0, open: 0, close: 0 }); }, [db, period]);
  const total = rows.reduce((s, v) => s + voucherTotal(v), 0);
  const canEdit = ['owner', 'accounts'].includes(user.role);
  return (
    <div className="page">
      <PageHead title="Day Book" sub="Every voucher for the period, including bills and receipts posted automatically">
        <button className="btn" onClick={() => downloadCsv('day-book.csv', [['Date', 'Particulars', 'Voucher type', 'Voucher no.', 'Amount', 'Narration'], ...rows.map((v) => [v.date, particulars(v, names), VTYPES[v.type].label, v.no, voucherTotal(v), v.narration])])}><Icon name="download" />CSV</button>
        <button className="btn" onClick={() => { const blob = new Blob([tallyXml(db, rows)], { type: 'application/xml' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'tally-vouchers.xml'; a.click(); }}><Icon name="download" />Tally XML</button>
        <a className="btn primary" href="#/accv"><Icon name="plus" />New voucher</a>
      </PageHead>
      <PeriodBar value={period} onChange={setPeriod} />
      <div className="grid g4 stagger">
        <Stat label="Vouchers" value={rows.length} money={false} icon="book" />
        <Stat label="Cash & bank received" value={cb.dr} icon="download" tone="green" />
        <Stat label="Cash & bank paid" value={cb.cr} icon="upload" tone="red" />
        <Stat label="Cash & bank closing" value={cb.close} icon="bank" tone="gold" />
      </div>
      <div className="card mt">
        <div className="card-head wrap">
          <div className="row wrap">
            <select className="input" style={{ width: 'auto' }} value={type} onChange={(e) => setType(e.target.value)}><option value="">All voucher types</option>{VKEYS.map((k) => <option key={k} value={k}>{VTYPES[k].label}</option>)}</select>
            <label className="row small" style={{ gap: 6 }}><input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />Include automatic entries</label>
          </div>
          <div style={{ width: 260 }}><Search value={q} onChange={setQ} placeholder="Particulars, number, narration" /></div>
        </div>
        <div className="table-wrap"><table className="t">
          <thead><tr><th>Date</th><th>Particulars</th><th>Voucher type</th><th>Voucher no.</th><th className="num">Amount</th><th /></tr></thead>
          <tbody>{rows.slice(0, 400).map((v) => (
            <tr key={v.id} className="click" onClick={() => setView(v)}>
              <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(v.date)}</td>
              <td><b>{particulars(v, names)}</b>{v.narration && <div className="small muted">{v.narration}</div>}</td>
              <td><TypeBadge type={v.type} />{v.auto && <span className="badge" style={{ marginLeft: 6 }}>auto</span>}</td>
              <td className="mono">{v.no}</td><td className="num">{num2(voucherTotal(v))}</td>
              <td className="right" onClick={(e) => e.stopPropagation()}>{!v.auto && canEdit && <button className="btn sm" onClick={() => openVoucherEdit(v)}><Icon name="edit" />Edit</button>}</td>
            </tr>
          ))}</tbody>
          <tfoot><tr><td colSpan={4}>Total ({rows.length} vouchers)</td><td className="num">{num2(total)}</td><td /></tr></tfoot>
        </table>{!rows.length && <Empty icon="book" text="No vouchers in this period." />}</div>
      </div>
      {view && <VoucherView v={view} onClose={() => setView(null)} onEdit={(v) => openVoucherEdit(v)} />}
    </div>
  );
}

// ---------------- Ledger ----------------
export function LedgerReport() {
  const { db } = useStore();
  const pre = useMemo(() => unstash('ledger'), []);
  const [ledger, setLedger] = useState(pre?.id || L.cash);
  const [period, setPeriod] = useState(pre?.period || initialPeriod(db, 'all'));
  const [view, setView] = useState(null);
  const [key, setKey] = useState(0);
  const leds = useMemo(() => ledgerList(db), [db]);
  const names = useMemo(() => ledgerMap(db), [db]);
  const st = useMemo(() => ledgerStatement(db, ledger, period.from, period.to), [db, ledger, period]);
  const l = names.get(ledger);
  const pick = (id) => { setLedger(id); setKey((k) => k + 1); };
  return (
    <div className="page">
      <PageHead title="Ledger" sub="Account statement with running balance">
        <button className="btn" onClick={() => downloadCsv(`ledger-${l?.name || 'account'}.csv`, [['Date', 'Particulars', 'Voucher type', 'Voucher no.', 'Debit', 'Credit', 'Balance'], ['', 'Opening balance', '', '', '', '', st.open], ...st.rows.map((r) => [r.date, r.particulars, VTYPES[r.v.type].label, r.v.no, r.dr, r.cr, r.balance])])}><Icon name="download" />CSV</button>
      </PageHead>
      <div className="period-bar">
        <span className="small strong">Ledger</span>
        <div style={{ width: 300 }} key={key}><LedgerInput value={ledger} onChange={(v) => v && setLedger(v)} options={leds} listId="dl-led-report" /></div>
        <button className="btn sm" onClick={() => pick(L.cash)}>Cash</button><button className="btn sm" onClick={() => pick(L.bank)}>Bank</button>
        <datalist id="dl-led-report">{leds.map((x) => <option key={x.id} value={x.name} />)}</datalist>
      </div>
      <PeriodBar value={period} onChange={setPeriod} />
      <div className="card">
        <div className="card-head"><div><h3>{l?.name}</h3><p>{fmtDate(period.from)} to {fmtDate(period.to)}</p></div><span className="badge blue">Closing {drcr(st.close)}</span></div>
        <div className="table-wrap"><table className="t">
          <thead><tr><th>Date</th><th>Particulars</th><th>Voucher type</th><th>Voucher no.</th><th className="num">Debit</th><th className="num">Credit</th><th className="num">Balance</th></tr></thead>
          <tbody>
            <tr className="partial"><td colSpan={6} className="strong">Opening balance</td><td className="num strong">{drcr(st.open)}</td></tr>
            {st.rows.map((r) => (
              <tr key={r.v.id + r.date + r.balance} className="click" onClick={() => setView(r.v)}>
                <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(r.date)}</td><td>{r.particulars}</td><td><TypeBadge type={r.v.type} /></td><td className="mono">{r.v.no}</td>
                <td className="num">{r.dr ? num2(r.dr) : ''}</td><td className="num">{r.cr ? num2(r.cr) : ''}</td><td className="num">{drcr(r.balance)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr><td colSpan={4}>Total</td><td className="num">{num2(st.dr)}</td><td className="num">{num2(st.cr)}</td><td className="num">{drcr(st.close)}</td></tr></tfoot>
        </table>{!st.rows.length && <Empty icon="book" text="No transactions in this period." />}</div>
      </div>
      {view && <VoucherView v={view} onClose={() => setView(null)} onEdit={openVoucherEdit} />}
    </div>
  );
}

// ---------------- Trial Balance ----------------
export function TrialBalance() {
  const { db } = useStore();
  const [period, setPeriod] = useState(() => initialPeriod(db, 'all'));
  const [open, setOpen] = useState({});
  const t = useMemo(() => trialTree(db, period.from, period.to), [db, period]);
  const flat = [];
  const walk = (n, depth) => { flat.push({ n, depth }); if (n.group && open[n.id]) n.children.forEach((c) => walk(c, depth + 1)); };
  t.roots.forEach((r) => walk(r, 0));
  const toggle = (id) => setOpen((o) => ({ ...o, [id]: !o[id] }));
  const allIds = []; const collect = (n) => { if (n.group) { allIds.push(n.id); n.children.forEach(collect); } }; t.roots.forEach(collect);
  const csv = () => downloadCsv('trial-balance.csv', [['Name', 'Opening', 'Debit', 'Credit', 'Closing'], ...(() => { const out = []; const w = (n, d) => { out.push([`${'  '.repeat(d)}${n.name}`, n.open, n.dr, n.cr, n.close]); n.children.forEach((c) => w(c, d + 1)); }; t.roots.forEach((r) => w(r, 0)); return out; })()]);
  const ok = Math.abs(t.total.dr - t.total.cr) < 0.01;
  return (
    <div className="page">
      <PageHead title="Trial Balance" sub="Group-wise summary; click a group to expand, a ledger to see its account">
        <button className="btn" onClick={() => setOpen(Object.fromEntries(allIds.map((i) => [i, true])))}>Expand all</button>
        <button className="btn" onClick={() => setOpen({})}>Collapse all</button>
        <button className="btn" onClick={csv}><Icon name="download" />CSV</button>
      </PageHead>
      <PeriodBar value={period} onChange={setPeriod} />
      <div className="card">
        <div className="table-wrap"><table className="t tb">
          <thead><tr><th>Particulars</th><th className="num">Opening balance</th><th className="num">Debit</th><th className="num">Credit</th><th className="num">Closing balance</th></tr></thead>
          <tbody>{flat.map(({ n, depth }) => (
            <tr key={n.id} className={n.group ? 'tb-group click' : 'click'} onClick={() => (n.group ? toggle(n.id) : (stash('ledger', { id: n.id, period }), go('accl')))}>
              <td style={{ paddingLeft: 14 + depth * 22 }}>{n.group && <Icon name="chevronDown" style={{ width: 13, height: 13, marginRight: 6, transform: open[n.id] ? 'none' : 'rotate(-90deg)', transition: 'transform .2s' }} />}<span className={n.group ? 'strong' : ''}>{n.name}</span>{n.virtual && <span className="badge" style={{ marginLeft: 6 }}>{n.virtual}</span>}</td>
              <td className="num">{drcr(n.open)}</td><td className="num">{n.dr ? num2(n.dr) : ''}</td><td className="num">{n.cr ? num2(n.cr) : ''}</td><td className="num">{drcr(n.close)}</td>
            </tr>
          ))}</tbody>
          <tfoot><tr><td>Grand total</td><td className="num">{drcr(t.total.open)}</td><td className="num">{num2(t.total.dr)}</td><td className="num">{num2(t.total.cr)}</td><td className="num">{drcr(t.total.close)}</td></tr></tfoot>
        </table></div>
      </div>
      <div className={`alert ${ok ? 'ok' : 'bad'} mt`}><Icon name={ok ? 'check' : 'alert'} />{ok ? 'The trial balance tallies: total debit equals total credit.' : `The trial balance does not tally (difference ${num2(Math.abs(t.total.dr - t.total.cr))}).`}</div>
    </div>
  );
}

// ---------------- two-sided statements ----------------
function Side({ rows, total, title }) {
  return (
    <div className="side">
      <div className="side-head">{title}</div>
      {rows.map((r, i) => (
        <div key={i} className={`side-row ${r.bold ? 'bold' : ''} ${r.go ? 'click' : ''}`} style={{ paddingLeft: 12 + (r.level || 0) * 18 }} onClick={r.go}>
          <span>{r.label}</span><span>{r.amount == null ? '' : num2(r.amount)}</span>
        </div>
      ))}
      <div className="side-row total"><span>Total</span><span>{num2(total)}</span></div>
    </div>
  );
}
const ledgerRows = (rows, level = 1) => rows.map((r) => ({ label: r.name, amount: r.amount, level, go: () => { stash('ledger', { id: r.id, period: null }); go('accl'); } }));

export function ProfitLoss() {
  const { db } = useStore();
  const [period, setPeriod] = useState(() => initialPeriod(db, 'all'));
  const p = useMemo(() => profitLoss(db, period.from, period.to), [db, period]);
  const T = p.totals;
  // Trading account
  const tl = [{ label: 'Opening stock', amount: p.openStock, bold: true }, { label: 'Purchase accounts', amount: T.purchases, bold: true }, ...ledgerRows(p.purchases), ...(T.dExp || p.dExp.length ? [{ label: 'Direct expenses', amount: T.dExp, bold: true }, ...ledgerRows(p.dExp)] : [])];
  const tr = [{ label: 'Sales accounts', amount: T.sales, bold: true }, ...ledgerRows(p.sales), ...(p.dInc.length ? [{ label: 'Direct incomes', amount: T.dInc, bold: true }, ...ledgerRows(p.dInc)] : []), { label: 'Closing stock', amount: p.closeStock, bold: true }];
  if (p.gross >= 0) tl.push({ label: 'Gross profit c/o', amount: p.gross, bold: true }); else tr.push({ label: 'Gross loss c/o', amount: -p.gross, bold: true });
  const tTotal = Math.max(p.openStock + T.purchases + T.dExp + Math.max(0, p.gross), T.sales + T.dInc + p.closeStock + Math.max(0, -p.gross));
  // Profit & loss account
  const pl = [...(p.gross < 0 ? [{ label: 'Gross loss b/f', amount: -p.gross, bold: true }] : []), { label: 'Indirect expenses', amount: T.iExp, bold: true }, ...ledgerRows(p.iExp)];
  const pr = [...(p.gross > 0 ? [{ label: 'Gross profit b/f', amount: p.gross, bold: true }] : []), ...(p.iInc.length ? [{ label: 'Indirect incomes', amount: T.iInc, bold: true }, ...ledgerRows(p.iInc)] : [])];
  if (p.net >= 0) pl.push({ label: 'Net profit', amount: p.net, bold: true }); else pr.push({ label: 'Net loss', amount: -p.net, bold: true });
  const pTotal = Math.max(Math.max(0, -p.gross) + T.iExp + Math.max(0, p.net), Math.max(0, p.gross) + T.iInc + Math.max(0, -p.net));
  const margin = T.sales ? p.net / T.sales * 100 : 0;
  return (
    <div className="page">
      <PageHead title="Profit & Loss A/c" sub="Trading account and profit & loss for the period; stock is valued from the inventory at average cost" />
      <PeriodBar value={period} onChange={setPeriod} />
      <div className="grid g4 stagger">
        <Stat label="Sales (excl. GST)" value={T.sales} icon="chart" />
        <Stat label="Gross profit" value={p.gross} icon="trend" tone="gold" sub={T.sales ? `${(p.gross / T.sales * 100).toFixed(1)}% of sales` : ''} />
        <Stat label="Indirect expenses" value={T.iExp} icon="wallet" tone="red" />
        <Stat label={p.net >= 0 ? 'Net profit' : 'Net loss'} value={Math.abs(p.net)} icon={p.net >= 0 ? 'check' : 'alert'} tone={p.net >= 0 ? 'green' : 'red'} sub={`${margin.toFixed(1)}% of sales`} />
      </div>
      <div className="card mt"><div className="card-head"><h3>Trading account</h3><span className="small muted">Dr · Expenses &nbsp; | &nbsp; Cr · Income</span></div>
        <div className="two-side"><Side title="Particulars (Dr)" rows={tl} total={tTotal} /><Side title="Particulars (Cr)" rows={tr} total={tTotal} /></div></div>
      <div className="card mt"><div className="card-head"><h3>Profit & loss account</h3></div>
        <div className="two-side"><Side title="Particulars (Dr)" rows={pl} total={pTotal} /><Side title="Particulars (Cr)" rows={pr} total={pTotal} /></div></div>
    </div>
  );
}

export function BalanceSheet() {
  const { db } = useStore();
  const [asOn, setAsOn] = useState(localDate());
  const [open, setOpen] = useState({});
  const b = useMemo(() => balanceSheet(db, asOn), [db, asOn]);
  const side = (secs, extra) => {
    const rows = [];
    for (const s of secs) {
      rows.push({ label: s.name, amount: s.amount, bold: true, go: () => setOpen((o) => ({ ...o, [s.id]: !o[s.id] })) });
      if (open[s.id]) rows.push(...ledgerRows(s.rows, 1));
    }
    return [...rows, ...extra];
  };
  const lExtra = [...(b.net >= 0 ? [{ label: 'Profit & Loss A/c (net profit to date)', amount: b.net, bold: true }] : []), ...(b.openingDiff > 0 ? [{ label: 'Difference in opening balances', amount: b.openingDiff, bold: true }] : [])];
  const aExtra = [...(b.net < 0 ? [{ label: 'Profit & Loss A/c (net loss to date)', amount: -b.net, bold: true }] : []), ...(b.openingDiff < 0 ? [{ label: 'Difference in opening balances', amount: -b.openingDiff, bold: true }] : [])];
  const ok = Math.abs(b.liabTotal - b.assetTotal) < 0.01;
  return (
    <div className="page">
      <PageHead title="Balance Sheet" sub="Click a group to see its ledgers; click a ledger for its account" />
      <div className="period-bar"><span className="small strong">As on</span><input className="input" type="date" value={asOn} onChange={(e) => e.target.value && setAsOn(e.target.value)} aria-label="As on date" /></div>
      <div className="card">
        <div className="two-side"><Side title="Liabilities" rows={side(b.liabilities, lExtra)} total={b.liabTotal} /><Side title="Assets" rows={side(b.assets, aExtra)} total={b.assetTotal} /></div>
      </div>
      <div className={`alert ${ok ? 'ok' : 'bad'} mt`}><Icon name={ok ? 'check' : 'alert'} />{ok ? 'The balance sheet tallies: liabilities equal assets.' : `Liabilities and assets differ by ${num2(Math.abs(b.liabTotal - b.assetTotal))}.`}</div>
    </div>
  );
}
