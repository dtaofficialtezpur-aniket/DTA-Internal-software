import { useEffect, useMemo } from 'react';
import { useStore } from '../../lib/store.jsx';
import { allVouchers, balances, drcr, groupIds, ledgerList, num2, VKEYS, VTYPES, voucherTotal, ledgerMap } from '../../lib/accounts.js';
import { localDate } from '../../lib/crmMeta.js';
import { Icon, PageHead } from '../../components/ui.jsx';
import { go, particulars, TypeBadge } from './shared.jsx';

const MENU = [
  ['Masters', [['Ledgers and groups', 'accm', 'columns', 'M']]],
  ['Transactions', [['Voucher entry', 'accv', 'edit', 'V'], ['Day Book', 'accdb', 'calendar', 'D']]],
  ['Display', [['Ledger', 'accl', 'book', 'L'], ['Trial Balance', 'acctb', 'scale', 'T'], ['Profit & Loss A/c', 'accpl', 'trend', 'P'], ['Balance Sheet', 'accbs', 'layers', 'B']]],
  ['Utilities', [['Bank reconciliation', 'bank', 'bank', 'R'], ['GST and Tally export', 'reports', 'download', 'E']]],
];

export default function Gateway() {
  const { db } = useStore();
  // Letter shortcuts shown on the menu (like Tally's Gateway).
  useEffect(() => {
    const keys = Object.fromEntries(MENU.flatMap(([, items]) => items.map(([, page, , hot]) => [hot.toLowerCase(), page])));
    const h = (e) => { if (e.ctrlKey || e.altKey || e.metaKey || ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName) || document.querySelector('.modal')) return; const p = keys[e.key.toLowerCase()]; if (p) go(p); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);
  const today = localDate();
  const names = useMemo(() => ledgerMap(db), [db]);
  const data = useMemo(() => {
    const b = balances(db, '0000-01-01', today);
    const leds = ledgerList(db);
    const grp = (g) => { const ids = groupIds(db, g); return leds.filter((l) => ids.has(l.group)).reduce((s, l) => s + (b.get(l.id)?.close || 0), 0); };
    const vs = allVouchers(db);
    return { cash: grp('cash'), bank: grp('bank'), debtors: grp('debtors'), creditors: -grp('creditors'), todayN: vs.filter((v) => v.date === today && !v.auto).length, recent: vs.filter((v) => !v.auto).slice(-6).reverse() };
  }, [db, today]);
  const FY = `${db.acc.booksFrom.slice(0, 4)}`;
  return (
    <div className="page">
      <PageHead title="Gateway of Accounts" sub={`${db.company.name} · books from ${new Date(db.acc.booksFrom + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`} />
      <div className="gateway">
        <div className="card gw-menu">
          {MENU.map(([title, items]) => (
            <div key={title}>
              <div className="gw-title">{title}</div>
              {items.map(([label, page, icon, hot]) => <button key={label} className="gw-item" onClick={() => go(page)}><Icon name={icon} /><span className="grow">{label}</span><kbd>{hot}</kbd></button>)}
            </div>
          ))}
        </div>
        <div className="grid" style={{ gap: 14, alignContent: 'start' }}>
          <div className="grid g4">
            {[['Cash in hand', data.cash, 'wallet', '#2e9a52', 'accl'], ['Bank balance', data.bank, 'bank', '#2a78d6', 'accl'], ['Receivable from customers', data.debtors, 'users', '#c7791a', 'acctb'], ['Payable to suppliers', data.creditors, 'cart', '#e0483f', 'acctb']].map(([l, v, ic, c, to]) => (
              <button key={l} className="card stat hover gw-stat" onClick={() => go(to)}><div className="ic" style={{ background: c + '1f', color: c }}><Icon name={ic} /></div><div className="label">{l}</div><div className="value" style={{ fontSize: 21 }}>{num2(v)}</div></button>
            ))}
          </div>
          <div className="card">
            <div className="card-head"><div><h3>Quick voucher entry</h3><p>{data.todayN} voucher(s) entered today</p></div></div>
            <div className="card-body row wrap">
              {VKEYS.map((k) => <button key={k} className="vq" style={{ '--c': VTYPES[k].color }} onClick={() => go('accv')}><kbd>{VTYPES[k].key}</kbd>{VTYPES[k].label}</button>)}
            </div>
          </div>
          <div className="card">
            <div className="card-head"><h3>Recent vouchers</h3><a className="btn sm ghost" href="#/accdb">Day Book</a></div>
            {data.recent.map((v) => (
              <div className="list-row" key={v.id}><TypeBadge type={v.type} /><div className="grow small"><b>{v.no}</b> · {particulars(v, names)}<div className="muted">{v.narration}</div></div><span className="small muted">{new Date(v.date + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</span><b className="small">{num2(voucherTotal(v))}</b></div>
            ))}
          </div>
          <div className="alert info"><Icon name="info" /><div>Bills raised at the counter, customer receipts and goods received are posted to these books <b>automatically</b>. Use voucher entry for everything else: expenses, payments, bank deposits, journals and adjustments. Daily cash and bank balances are on the voucher screen.</div></div>
        </div>
      </div>
    </div>
  );
}
