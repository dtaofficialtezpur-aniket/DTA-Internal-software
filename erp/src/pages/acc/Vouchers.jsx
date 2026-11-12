import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../../lib/store.jsx';
import { allVouchers, balances, drcr, GST_RATES, groupIds, L, ledgerList, ledgerMap, num2, taxLedgerId, VKEYS, VTYPES, voucherNo, voucherTotal } from '../../lib/accounts.js';
import { localDate } from '../../lib/crmMeta.js';
import { money, nowIso, round2, uid } from '../../lib/format.js';
import { DemoLeft, Empty, Icon } from '../../components/ui.jsx';
import { go, LedgerForm, particulars, TypeBadge, unstash, VoucherView } from './shared.jsx';

const MODE = { payment: 'single', receipt: 'single', contra: 'single', journal: 'journal', sales: 'invoice', purchase: 'invoice', creditnote: 'invoice', debitnote: 'invoice' };
const SIDE = { payment: { account: 'cr', rows: 'dr' }, receipt: { account: 'dr', rows: 'cr' }, contra: { account: 'cr', rows: 'dr' } };
const LABELS = {
  payment: ['Account (paid from)', 'Paid to'], receipt: ['Account (received in)', 'Received from'], contra: ['From (cash / bank)', 'To (cash / bank)'],
  sales: ['Party A/c (customer)', 'Sales ledger'], purchase: ['Party A/c (supplier)', 'Purchase ledger'],
  creditnote: ['Party A/c (customer)', 'Sales return ledger'], debitnote: ['Party A/c (supplier)', 'Purchase return ledger'],
};
const row = (side = 'dr') => ({ ledger: '', amount: '', side });
const blank = (type, date) => ({
  id: null, type, date, account: L.cash,
  rows: MODE[type] === 'journal' ? [row('dr'), row('cr')] : [row()],
  party: '', main: ['sales', 'creditnote'].includes(type) ? L.salesTmt : L.purchase, taxable: '', rate: 18, gstType: 'auto', ref: '', narration: '',
});

export default function Vouchers() {
  const { db, user, update, toast, guard } = useStore();
  const root = useRef();
  const wrapRef = useRef();
  const [showEntry, setShowEntry] = useState(false);
  const [type, setType] = useState('payment');
  const [form, setForm] = useState(() => blank('payment', localDate()));
  const [nonce, setNonce] = useState(0);
  const [view, setView] = useState(null);
  const [newLedger, setNewLedger] = useState(false);
  const vt = VTYPES[type];
  const mode = MODE[type];

  const leds = useMemo(() => ledgerList(db), [db]);
  const names = useMemo(() => ledgerMap(db), [db]);
  const set = useMemo(() => {
    const ids = (g) => groupIds(db, g);
    const cb = new Set([...ids('cash'), ...ids('bank')]);
    return {
      all: leds, cb: leds.filter((l) => cb.has(l.group)),
      party: (t) => leds.filter((l) => [...(['sales', 'creditnote'].includes(t) ? ids('debtors') : ids('creditors')), ...cb].includes(l.group)),
      main: (t) => leds.filter((l) => ids(['sales', 'creditnote'].includes(t) ? 'sales' : 'purchase').has(l.group)),
    };
  }, [db, leds]);
  const bal = useMemo(() => balances(db, '0000-01-01', form.date), [db, form.date]);
  const cur = (id) => (id ? drcr(bal.get(id)?.close || 0) : '');

  const reset = (t = type, date = form.date) => { setForm(blank(t, date)); setNonce((n) => n + 1); setTimeout(() => root.current?.querySelector('.tally-body [data-f]')?.focus(), 40); };
  const switchType = (t) => { setType(t); reset(t); };
  const edit = (v) => { setView(null); setType(v.type); setForm({ ...v.form, id: v.id }); setNonce((n) => n + 1); };

  // Edit hand-off from the Day Book.
  useEffect(() => {
    const id = unstash('edit');
    const v = id && db.acc.vouchers.find((x) => x.id === id);
    if (v?.form) edit(v);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Tally function keys: F4 Contra, F5 Payment, F6 Receipt, F7 Journal, F8 Sales, F9 Purchase, Ctrl+F8 Credit Note, Ctrl+F9 Debit Note.
  useEffect(() => {
    const h = (e) => {
      if (document.querySelector('.modal')) return;
      const t = e.ctrlKey ? { F8: 'creditnote', F9: 'debitnote' }[e.key] : { F4: 'contra', F5: 'payment', F6: 'receipt', F7: 'journal', F8: 'sales', F9: 'purchase' }[e.key];
      if (t) { e.preventDefault(); switchType(t); }
      if (e.key === 'F2') { e.preventDefault(); root.current?.querySelector('[data-date]')?.focus(); }
      if (e.ctrlKey && e.key.toLowerCase() === 'd' && form.id) { e.preventDefault(); const v = db.acc.vouchers.find((x) => x.id === form.id); if (v) remove(v); }
      if (e.altKey && e.key.toLowerCase() === 'c') { e.preventDefault(); setNewLedger(true); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }); // re-bound each render so switchType sees the current date

  // ---------- turn the form into ledger lines ----------
  const build = (f = form) => {
    const errors = [], warn = [];
    let lines = [];
    const need = (cond, msg) => { if (!cond) errors.push(msg); };
    if (!f.date) errors.push('Enter the voucher date.');
    if (mode === 'single') {
      const s = SIDE[type];
      const rows = f.rows.filter((r) => r.ledger || r.amount);
      need(f.account, `Choose the ${LABELS[type][0].toLowerCase()}.`);
      need(rows.length, 'Add at least one line.');
      for (const r of rows) {
        need(r.ledger, 'Choose a ledger on every line.'); need(Number(r.amount) > 0, 'Enter an amount on every line.');
        if (r.ledger && r.ledger === f.account) errors.push('The account and the line ledger cannot be the same.');
        if (type === 'contra' && r.ledger && !set.cb.some((l) => l.id === r.ledger)) errors.push('Contra entries are between cash and bank ledgers only.');
      }
      const tot = round2(rows.reduce((a, r) => a + (Number(r.amount) || 0), 0));
      lines = [...rows.map((r) => ({ ledger: r.ledger, dr: s.rows === 'dr' ? round2(Number(r.amount)) : 0, cr: s.rows === 'cr' ? round2(Number(r.amount)) : 0 })),
        { ledger: f.account, dr: s.account === 'dr' ? tot : 0, cr: s.account === 'cr' ? tot : 0 }];
      if (s.account === 'cr' && f.account && (bal.get(f.account)?.close || 0) - tot < -0.005 && set.cb.some((l) => l.id === f.account)) warn.push(`${names.get(f.account)?.name} would go below zero (${drcr((bal.get(f.account)?.close || 0) - tot)}).`);
    } else if (mode === 'journal') {
      const rows = f.rows.filter((r) => r.ledger || r.amount);
      need(rows.length >= 2, 'A journal needs at least two lines.');
      for (const r of rows) { need(r.ledger, 'Choose a ledger on every line.'); need(Number(r.amount) > 0, 'Enter an amount on every line.'); }
      lines = rows.map((r) => ({ ledger: r.ledger, dr: r.side === 'dr' ? round2(Number(r.amount)) : 0, cr: r.side === 'cr' ? round2(Number(r.amount)) : 0 }));
      const d = round2(lines.reduce((a, l) => a + l.dr, 0)), c = round2(lines.reduce((a, l) => a + l.cr, 0));
      need(Math.abs(d - c) < 0.005, `Debit and credit do not tally (difference ${num2(Math.abs(d - c))}).`);
    } else {
      const base = round2(Number(f.taxable) || 0);
      need(f.party, `Choose the ${LABELS[type][0].toLowerCase()}.`); need(f.main, `Choose the ${LABELS[type][1].toLowerCase()}.`); need(base > 0, 'Enter the amount before GST.');
      const rate = Number(f.rate) || 0;
      const partyL = names.get(f.party);
      const partyState = String(partyL?.stateCode || partyL?.gstin || '').slice(0, 2);
      const inter = f.gstType === 'inter' || (f.gstType === 'auto' && partyState && partyState !== String(db.company.stateCode));
      const kind = ['sales', 'creditnote'].includes(type) ? 'o' : 'i';
      const tax = round2(base * rate / 100);
      const taxLines = !rate ? [] : inter ? [{ ledger: taxLedgerId(kind, 'igst', rate), amt: tax }] : [{ ledger: taxLedgerId(kind, 'cgst', rate / 2), amt: round2(tax / 2) }, { ledger: taxLedgerId(kind, 'sgst', rate / 2), amt: round2(tax - round2(tax / 2)) }];
      const gross = round2(base + taxLines.reduce((a, t) => a + t.amt, 0));
      const partySideDr = ['sales', 'debitnote'].includes(type); // party debited on sales and debit notes
      lines = [{ ledger: f.party, dr: partySideDr ? gross : 0, cr: partySideDr ? 0 : gross }, { ledger: f.main, dr: partySideDr ? 0 : base, cr: partySideDr ? base : 0 }, ...taxLines.map((t) => ({ ledger: t.ledger, dr: partySideDr ? 0 : t.amt, cr: partySideDr ? t.amt : 0 }))];
    }
    return { errors: [...new Set(errors)], warn, lines: lines.filter((l) => l.ledger) };
  };
  const built = build();
  const totalDr = round2(built.lines.reduce((a, l) => a + l.dr, 0)), totalCr = round2(built.lines.reduce((a, l) => a + l.cr, 0));

  const save = () => {
    const r = build();
    if (r.errors.length) return toast(r.errors[0], 'bad');
    const editing = !!form.id;
    if (!editing && !guard('acc_' + type)) return;
    const next = (db.acc.seq[type] || 0) + 1;
    const no = editing ? db.acc.vouchers.find((v) => v.id === form.id).no : voucherNo(type, next);
    const total = round2(r.lines.reduce((a, l) => a + l.dr, 0));
    const snapshot = structuredClone({ ...form, id: undefined });
    update((d) => {
      const rec = { date: form.date, lines: r.lines, narration: form.narration.trim(), ref: form.ref.trim(), form: snapshot };
      if (editing) Object.assign(d.acc.vouchers.find((v) => v.id === form.id), rec, { modifiedBy: user.name, modifiedAt: nowIso() });
      else { d.acc.seq[type] = next; d.acc.vouchers.push({ id: uid('v'), type, no, ...rec, createdBy: user.name, createdAt: nowIso() }); }
    }, [editing ? 'Edited voucher' : 'Posted voucher', 'Accounting', `${vt.label} ${no} · ${money(total)}${form.narration ? ` · ${form.narration}` : ''}`], editing ? null : 'acc_' + type);
    toast(`${vt.label} voucher ${no} ${editing ? 'updated' : 'saved'} · ${money(total)}`);
    reset(type, form.date);
  };
  const remove = (v) => {
    if (!confirm(`Delete ${VTYPES[v.type].label} voucher ${v.no}? This cannot be undone.`)) return;
    update((d) => { d.acc.vouchers = d.acc.vouchers.filter((x) => x.id !== v.id); }, ['Deleted voucher', 'Accounting', `${VTYPES[v.type].label} ${v.no} · ${money(voucherTotal(v))}`]);
    toast('Voucher deleted'); if (form.id === v.id) reset();
  };

  // Enter moves to the next field (adds a line after the last amount); Ctrl+A accepts; Esc clears.
  const onKey = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') { e.preventDefault(); save(); return; }
    if (e.key === 'Escape') { reset(); return; }
    if (e.key === 'Enter' && ['INPUT', 'SELECT'].includes(e.target.tagName) && e.target.type !== 'checkbox') {
      e.preventDefault();
      const els = [...root.current.querySelectorAll('[data-f]')];
      const i = els.indexOf(e.target);
      if (e.target.dataset.last === '1' && mode !== 'invoice') { const idx = form.rows.length; addRow(); setTimeout(() => root.current?.querySelector(`[data-row="${idx}"][data-f]`)?.focus(), 40); }
      else els[i + 1]?.focus();
    }
  };
  const addRow = () => setForm((f) => ({ ...f, rows: [...f.rows, row(mode === 'journal' ? (round2(f.rows.filter((r) => r.side === 'dr').reduce((a, r) => a + (+r.amount || 0), 0)) > round2(f.rows.filter((r) => r.side === 'cr').reduce((a, r) => a + (+r.amount || 0), 0)) ? 'cr' : 'dr') : 'dr')] }));
  const setRow = (i, patch) => setForm((f) => ({ ...f, rows: f.rows.map((r, j) => (j === i ? { ...r, ...patch } : r)) }));
  const canPost = ['owner', 'accounts'].includes(user.role);

  const day = useMemo(() => {
    const b = balances(db, form.date, form.date);
    const sum = (g) => { const ids = groupIds(db, g); return leds.filter((l) => ids.has(l.group)).reduce((a, l) => { const x = b.get(l.id) || { open: 0, dr: 0, cr: 0, close: 0 }; return { open: a.open + x.open, dr: a.dr + x.dr, cr: a.cr + x.cr, close: a.close + x.close }; }, { open: 0, dr: 0, cr: 0, close: 0 }); };
    const vs = allVouchers(db).filter((v) => v.date === form.date);
    return { cash: sum('cash'), bank: sum('bank'), manual: vs.filter((v) => !v.auto), auto: vs.filter((v) => v.auto) };
  }, [db, form.date, leds]);
  const shiftDay = (n) => { const d = new Date(form.date + 'T00:00:00'); d.setDate(d.getDate() + n); setForm({ ...form, date: localDate(d) }); };

  const total = round2(mode === 'single' ? form.rows.reduce((a, r) => a + (Number(r.amount) || 0), 0) : mode === 'journal' ? totalDr : totalDr);
  const weekday = new Date(form.date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long' });
  const voucherNoText = form.id ? db.acc.vouchers.find((v) => v.id === form.id)?.no : voucherNo(type, (db.acc.seq[type] || 0) + 1);
  const taxRows = built.lines.filter((l) => /^l-[oi]-/.test(l.ledger));
  const jTot = { dr: round2(form.rows.filter((r) => r.side === 'dr').reduce((a, r) => a + (Number(r.amount) || 0), 0)), cr: round2(form.rows.filter((r) => r.side === 'cr').reduce((a, r) => a + (Number(r.amount) || 0), 0)) };
  const field = (id, onChange, options, extra = {}) => <LedgerField value={id} onChange={onChange} options={options} {...extra} />;

  return (
    <div className="page acc-page tally" onKeyDown={onKey} ref={root}>
      <div className="tally-wrap" ref={wrapRef}>
        <LedgerCtx.Provider value={{ wrap: wrapRef, cur, create: () => setNewLedger(true) }}>
          <div className="tally-main">
            <div className="vstrip">
              {VKEYS.map((k) => (
                <button key={k} className={`key-btn ${type === k ? 'on' : ''}`} style={{ '--c': VTYPES[k].color }} onClick={() => switchType(k)} tabIndex={-1}><kbd>{VTYPES[k].key}</kbd><span>{VTYPES[k].label}</span></button>
              ))}
              <span className="grow" />
              <button className="key-btn" onClick={() => root.current?.querySelector('[data-date]')?.focus()} tabIndex={-1}><kbd>F2</kbd><span>Date</span></button>
              <button className="key-btn" onClick={() => setNewLedger(true)} tabIndex={-1}><kbd>Alt+C</kbd><span>Create ledger</span></button>
              {form.id && <button className="key-btn" onClick={() => { const v = db.acc.vouchers.find((x) => x.id === form.id); if (v) remove(v); }} tabIndex={-1}><kbd>Ctrl+D</kbd><span>Delete</span></button>}
            </div>
          <section className="tally-sheet">
            <div className="tally-title"><span>Accounting Voucher {form.id ? 'Alteration' : 'Creation'}</span><span>{db.company.name}</span></div>
            <div className="tally-head">
              <span className="tally-vtype" style={{ background: vt.color }}>{vt.label}</span>
              <span className="tally-no">No. <b>{voucherNoText}</b></span>
              {mode === 'invoice' && <label className="tally-ref">{['sales', 'creditnote'].includes(type) ? 'Ref' : 'Supplier bill no.'}<input className="tf" data-f="1" value={form.ref} onChange={(e) => setForm({ ...form, ref: e.target.value })} /></label>}
              <span className="grow" />
              <label className="tally-date"><input className="tf" type="date" data-f="1" data-date="1" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} aria-label="Voucher date" /><b>{weekday}</b></label>
            </div>

            <div className="tally-body" key={nonce}>
              {mode === 'single' && (
                <>
                  <div className="t-acc"><span className="t-lbl">{LABELS[type][0]}</span><span>:</span>{field(form.account, (v) => setForm((f) => ({ ...f, account: v })), set.cb, { autoFocus: true, dataRow: 'a' })}<span className="t-cur">{cur(form.account) && `Cur Bal: ${cur(form.account)}`}</span></div>
                  <table className="t-table">
                    <thead><tr><th>Particulars</th><th className="num">Amount</th><th style={{ width: 28 }} /></tr></thead>
                    <tbody>{form.rows.map((r, i) => (
                      <tr key={i}>
                        <td>{field(r.ledger, (v) => setRow(i, { ledger: v }), type === 'contra' ? set.cb : set.all, { dataRow: i })}{r.ledger && <div className="t-cur">Cur Bal: {cur(r.ledger)}</div>}</td>
                        <td className="num"><input className="tf num" inputMode="decimal" data-f="1" data-row={i} data-last={i === form.rows.length - 1 ? '1' : undefined} value={r.amount} placeholder="" onChange={(e) => setRow(i, { amount: e.target.value.replace(/[^\d.]/g, '') })} aria-label="Amount" /></td>
                        <td>{form.rows.length > 1 && <button className="t-x" onClick={() => setForm({ ...form, rows: form.rows.filter((_, j) => j !== i) })} aria-label="Remove line" tabIndex={-1}>×</button>}</td>
                      </tr>
                    ))}</tbody>
                    <tfoot><tr><td><button className="t-add" onClick={addRow} tabIndex={-1}>+ Add line</button></td><td className="num t-total">{num2(total)}</td><td /></tr></tfoot>
                  </table>
                </>
              )}

              {mode === 'journal' && (
                <table className="t-table">
                  <thead><tr><th style={{ width: 54 }}>Dr / Cr</th><th>Particulars</th><th className="num" style={{ width: 150 }}>Debit</th><th className="num" style={{ width: 150 }}>Credit</th><th style={{ width: 28 }} /></tr></thead>
                  <tbody>{form.rows.map((r, i) => {
                    const amt = (side) => (r.side === side
                      ? <input className="tf num" inputMode="decimal" data-f="1" data-row={i} data-last={i === form.rows.length - 1 ? '1' : undefined} value={r.amount} onChange={(e) => setRow(i, { amount: e.target.value.replace(/[^\d.]/g, '') })} aria-label={side === 'dr' ? 'Debit' : 'Credit'} /> : null);
                    return (
                      <tr key={i}>
                        <td><select className="tf" data-f="1" data-row={i} value={r.side} onChange={(e) => setRow(i, { side: e.target.value })} aria-label="Dr or Cr"><option value="dr">Dr</option><option value="cr">Cr</option></select></td>
                        <td>{field(r.ledger, (v) => setRow(i, { ledger: v }), set.all, { dataRow: i, autoFocus: i === 0 })}{r.ledger && <div className="t-cur">Cur Bal: {cur(r.ledger)}</div>}</td>
                        <td className="num">{amt('dr')}</td><td className="num">{amt('cr')}</td>
                        <td>{form.rows.length > 2 && <button className="t-x" onClick={() => setForm({ ...form, rows: form.rows.filter((_, j) => j !== i) })} aria-label="Remove line" tabIndex={-1}>×</button>}</td>
                      </tr>
                    );
                  })}</tbody>
                  <tfoot><tr><td /><td><button className="t-add" onClick={addRow} tabIndex={-1}>+ Add line</button></td><td className="num t-total">{num2(jTot.dr)}</td><td className="num t-total">{num2(jTot.cr)}</td><td /></tr></tfoot>
                </table>
              )}

              {mode === 'invoice' && (
                <>
                  <div className="t-acc"><span className="t-lbl">{LABELS[type][0]}</span><span>:</span>{field(form.party, (v) => setForm((f) => ({ ...f, party: v })), set.party(type), { autoFocus: true })}<span className="t-cur">{cur(form.party) && `Cur Bal: ${cur(form.party)}`}</span></div>
                  <div className="t-inline">
                    <label>GST rate <select className="tf" data-f="1" value={form.rate} onChange={(e) => setForm({ ...form, rate: Number(e.target.value) })}><option value={0}>No GST</option>{GST_RATES.map((r) => <option key={r} value={r}>{r}%</option>)}</select></label>
                    <label>GST type <select className="tf" data-f="1" value={form.gstType} onChange={(e) => setForm({ ...form, gstType: e.target.value })}><option value="auto">Auto (by party state)</option><option value="intra">CGST + SGST</option><option value="inter">IGST</option></select></label>
                  </div>
                  <table className="t-table">
                    <thead><tr><th>Particulars</th><th className="num" style={{ width: 70 }}>Rate</th><th className="num" style={{ width: 180 }}>Amount</th></tr></thead>
                    <tbody>
                      <tr>
                        <td><span className="t-lbl small">{LABELS[type][1]}</span>{field(form.main, (v) => setForm((f) => ({ ...f, main: v })), set.main(type), { dataRow: 0 })}{form.main && <div className="t-cur">Cur Bal: {cur(form.main)}</div>}</td>
                        <td />
                        <td className="num"><input className="tf num" inputMode="decimal" data-f="1" data-row={0} data-last="1" value={form.taxable} onChange={(e) => setForm({ ...form, taxable: e.target.value.replace(/[^\d.]/g, '') })} aria-label="Amount before GST" /></td>
                      </tr>
                      {taxRows.map((l) => (
                        <tr key={l.ledger} className="t-auto"><td><i>{names.get(l.ledger)?.name}</i></td><td className="num">{String(names.get(l.ledger)?.name || '').match(/@ ([\d.]+)%/)?.[1]}%</td><td className="num">{num2(l.dr || l.cr)}</td></tr>
                      ))}
                    </tbody>
                    <tfoot><tr><td /><td /><td className="num t-total">{num2(round2((built.lines.find((l) => l.ledger === form.party)?.dr || 0) + (built.lines.find((l) => l.ledger === form.party)?.cr || 0)))}</td></tr></tfoot>
                  </table>
                </>
              )}
            </div>

            <div className="tally-narr"><span>Narration:</span><textarea className="tf" rows={2} data-f="1" value={form.narration} onChange={(e) => setForm({ ...form, narration: e.target.value })} placeholder="" /></div>

            {built.warn.map((w) => <div key={w} className="alert warn" style={{ margin: '0 16px 10px' }}><Icon name="alert" />{w}</div>)}
            {built.lines.length > 0 && Math.abs(totalDr - totalCr) > 0.005 && <div className="alert bad" style={{ margin: '0 16px 10px' }}><Icon name="alert" />Debit and credit differ by {num2(Math.abs(totalDr - totalCr))}.</div>}
            {showEntry && built.lines.length > 0 && (
              <div className="acc-preview" style={{ margin: '0 16px 12px' }}>
                <div className="small muted strong" style={{ marginBottom: 6 }}>ACCOUNTING ENTRY</div>
                <table className="t"><tbody>
                  {built.lines.map((l, i) => <tr key={i}><td style={{ width: 36 }}><span className={`drcr ${l.dr ? 'dr' : 'cr'}`}>{l.dr ? 'Dr' : 'Cr'}</span></td><td>{names.get(l.ledger)?.name}</td><td className="num">{l.dr ? num2(l.dr) : ''}</td><td className="num">{l.cr ? num2(l.cr) : ''}</td></tr>)}
                </tbody><tfoot><tr><td /><td>Total</td><td className="num">{num2(totalDr)}</td><td className="num">{num2(totalCr)}</td></tr></tfoot></table>
              </div>
            )}
            <div className="tally-foot">
              <button className="t-link" onClick={() => setShowEntry(!showEntry)} tabIndex={-1}>{showEntry ? 'Hide' : 'Show'} Dr / Cr entry</button>
              <DemoLeft kind={'acc_' + type} />
              <span className="grow" />
              <button className="btn" onClick={() => reset()} tabIndex={-1}>Quit <kbd>Esc</kbd></button>
              <button className="btn primary" onClick={save} disabled={!canPost} title={canPost ? '' : 'Only Accounts and the owner can post vouchers'}><Icon name="check" />{form.id ? 'Update' : 'Accept'} <kbd>Ctrl+A</kbd></button>
            </div>
          </section>
          </div>
        </LedgerCtx.Provider>

        <aside className="tally-side">
          <div className="card">
            <div className="card-head">
              <div><h3>Day summary</h3><p>{new Date(form.date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</p></div>
              <div className="row" style={{ gap: 2 }}>
                <button className="btn ghost icon-btn sm" onClick={() => shiftDay(-1)} aria-label="Previous day" tabIndex={-1}><Icon name="chevronLeft" /></button>
                <button className="btn ghost sm" onClick={() => setForm({ ...form, date: localDate() })} tabIndex={-1}>Today</button>
                <button className="btn ghost icon-btn sm" onClick={() => shiftDay(1)} aria-label="Next day" tabIndex={-1}><Icon name="chevronRight" /></button>
              </div>
            </div>
            <div className="table-wrap"><table className="t"><thead><tr><th /><th className="num">Opening</th><th className="num">Received</th><th className="num">Paid</th><th className="num">Closing</th></tr></thead><tbody>
              {[['Cash', day.cash], ['Bank', day.bank]].map(([n, bb]) => <tr key={n}><td className="strong">{n}</td><td className="num">{num2(bb.open)}</td><td className="num" style={{ color: 'var(--ok)' }}>{num2(bb.dr)}</td><td className="num" style={{ color: 'var(--bad)' }}>{num2(bb.cr)}</td><td className="num strong">{num2(bb.close)}</td></tr>)}
            </tbody></table></div>
          </div>
          <div className="card">
            <div className="card-head"><h3>Vouchers entered</h3><span className="badge blue">{day.manual.length}</span></div>
            {day.manual.map((v) => (
              <div className="list-row" key={v.id}>
                <TypeBadge type={v.type} />
                <button className="grow small day-link" onClick={() => setView(v)} tabIndex={-1}><b>{v.no}</b> · {particulars(v, names)}<div className="muted">{v.narration}</div></button>
                <b className="small">{num2(voucherTotal(v))}</b>
                {canPost && <><button className="btn ghost icon-btn sm" onClick={() => edit(v)} aria-label="Edit voucher" tabIndex={-1}><Icon name="edit" /></button><button className="btn ghost icon-btn sm" onClick={() => remove(v)} aria-label="Delete voucher" tabIndex={-1}><Icon name="trash" style={{ color: 'var(--bad)' }} /></button></>}
              </div>
            ))}
            {!day.manual.length && <Empty icon="book" text="No vouchers entered for this date yet." />}
            {day.auto.length > 0 && <div className="small muted card-body" style={{ borderTop: '1px solid var(--line-2)' }}>{day.auto.length} bill(s) and receipt(s) were posted automatically from billing. <a href="#/accdb" onClick={() => { sessionStorage.setItem('stc-acc-day', JSON.stringify(form.date)); }}>View in Day Book</a></div>}
          </div>
        </aside>
      </div>

      {view && <VoucherView v={view} onClose={() => setView(null)} onEdit={edit} />}
      {newLedger && <LedgerForm onClose={() => setNewLedger(false)} onSaved={() => toast('Ledger created — it is now available in the list')} />}
    </div>
  );
}

// ---------- Tally-style ledger field: type to search, a "List of Ledger Accounts" opens on the right ----------
const LedgerCtx = createContext(null);
function LedgerField({ value, onChange, options, dataRow, dataLast, autoFocus }) {
  const ctx = useContext(LedgerCtx);
  const [text, setText] = useState(options.find((l) => l.id === value)?.name || '');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [top, setTop] = useState(0);
  const el = useRef();
  const exact = options.find((l) => l.name.toLowerCase() === text.trim().toLowerCase());
  const q = exact && exact.id === value ? '' : text.trim().toLowerCase();
  const matches = options.filter((l) => !q || l.name.toLowerCase().includes(q)).slice(0, 40);
  useLayoutEffect(() => {
    if (open && ctx.wrap.current && el.current) setTop(Math.max(0, el.current.getBoundingClientRect().top - ctx.wrap.current.getBoundingClientRect().top - 6));
  }, [open, text, ctx.wrap]);
  const pick = (l) => { setText(l.name); onChange(l.id); setOpen(false); };
  return (
    <>
      <input ref={el} className="tf" data-f="1" data-row={dataRow} data-last={dataLast} value={text} autoFocus={autoFocus} aria-label="Ledger" autoComplete="off"
        style={value || !text ? undefined : { color: 'var(--bad)' }}
        onFocus={(e) => { setOpen(true); e.target.select(); }} onBlur={() => setTimeout(() => setOpen(false), 130)}
        onChange={(e) => { setText(e.target.value); setActive(0); setOpen(true); const m = options.find((l) => l.name.toLowerCase() === e.target.value.trim().toLowerCase()); onChange(m ? m.id : ''); }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, matches.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          else if (e.key === 'Enter' && open && matches.length && !(exact && exact.id === value)) pick(matches[Math.min(active, matches.length - 1)]);
        }} />
      {open && ctx.wrap.current && createPortal(
        <div className="lf-list" style={{ top }} onMouseDown={(e) => e.preventDefault()}>
          <div className="lf-head">List of Ledger Accounts</div>
          <button className="lf-item create" onMouseDown={() => { setOpen(false); ctx.create(); }}>+ Create <kbd>Alt+C</kbd></button>
          <div className="lf-scroll">
            {matches.map((l, i) => <button key={l.id} className={`lf-item ${i === active ? 'on' : ''}`} onMouseDown={() => pick(l)}><span className="grow">{l.name}</span><span className="lf-bal">{ctx.cur(l.id)}</span></button>)}
            {!matches.length && <div className="lf-empty">No ledger matches "{text}"</div>}
          </div>
        </div>, ctx.wrap.current)}
    </>
  );
}
export { go };
