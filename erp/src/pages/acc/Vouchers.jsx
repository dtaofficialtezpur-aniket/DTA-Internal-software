import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../../lib/store.jsx';
import { allVouchers, balances, drcr, GST_RATES, groupIds, L, ledgerList, ledgerMap, num2, taxLedgerId, VKEYS, VTYPES, voucherNo, voucherTotal } from '../../lib/accounts.js';
import { localDate } from '../../lib/crmMeta.js';
import { money, nowIso, round2, uid } from '../../lib/format.js';
import { DemoLeft, Empty, Field, Icon, PageHead } from '../../components/ui.jsx';
import { go, LedgerForm, LedgerInput, particulars, TypeBadge, unstash, VoucherView } from './shared.jsx';

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

  const reset = (t = type, date = form.date) => { setForm(blank(t, date)); setNonce((n) => n + 1); setTimeout(() => root.current?.querySelector('[data-f]')?.focus(), 30); };
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
      if (e.target.dataset.last === '1' && mode !== 'invoice') { addRow(); setTimeout(() => { const n = [...root.current.querySelectorAll('[data-f]')]; n[Math.max(0, n.length - (mode === 'journal' ? 3 : 2))]?.focus(); }, 30); }
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

  return (
    <div className="page acc-page" onKeyDown={onKey} ref={root}>
      <PageHead title="Voucher Entry" sub="Accounting vouchers · enter daily transactions like Tally">
        <DemoLeft kind={'acc_' + type} />
        <button className="btn" onClick={() => setNewLedger(true)} title="Alt + C"><Icon name="plus" />Create ledger</button>
      </PageHead>

      <div className="vtabs" role="tablist">
        {VKEYS.map((k) => (
          <button key={k} role="tab" aria-selected={type === k} className={type === k ? 'on' : ''} style={{ '--c': VTYPES[k].color }} onClick={() => switchType(k)}>
            <kbd>{VTYPES[k].key}</kbd>{VTYPES[k].label}
          </button>
        ))}
      </div>

      <div className="acc-grid">
        <div className="card acc-form" key={nonce}>
          <div className="acc-form-head" style={{ borderTopColor: vt.color }}>
            <div><span className="vtype big" style={{ color: vt.color, background: vt.color + '1a' }}>{vt.label}</span> <span className="small muted">{vt.hint}</span></div>
            {form.id && <span className="badge gold">Editing {db.acc.vouchers.find((v) => v.id === form.id)?.no}</span>}
          </div>
          <div className="card-body grid" style={{ gap: 14 }}>
            <div className="grid g3">
              <Field label="Voucher no."><input className="input" disabled value={form.id ? db.acc.vouchers.find((v) => v.id === form.id)?.no : voucherNo(type, (db.acc.seq[type] || 0) + 1)} /></Field>
              <Field label="Date"><input className="input" type="date" data-f="1" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
              {mode === 'invoice' && <Field label={['sales', 'creditnote'].includes(type) ? 'Invoice / reference no.' : "Supplier's bill no."}><input className="input" data-f="1" value={form.ref} onChange={(e) => setForm({ ...form, ref: e.target.value })} /></Field>}
            </div>

            {mode === 'single' && (
              <>
                <Field label={LABELS[type][0]}>
                  <div className="row"><div className="grow"><LedgerInput value={form.account} onChange={(v) => setForm({ ...form, account: v })} options={set.cb} listId="dl-cb" dataF="1" autoFocus /></div><span className="curbal">{cur(form.account) && `Cur Bal: ${cur(form.account)}`}</span></div>
                </Field>
                <div className="acc-lines">
                  <div className="acc-lines-head"><span>{LABELS[type][1]}</span><span className="num">Amount (₹)</span><span /></div>
                  {form.rows.map((r, i) => (
                    <div className="acc-line" key={i}>
                      <div><LedgerInput value={r.ledger} onChange={(v) => setRow(i, { ledger: v })} options={type === 'contra' ? set.cb : set.all} listId={type === 'contra' ? 'dl-cb' : 'dl-all'} dataF="1" /><span className="curbal">{cur(r.ledger) && `Cur Bal: ${cur(r.ledger)}`}</span></div>
                      <input className="input num" inputMode="decimal" data-f="1" data-last={i === form.rows.length - 1 ? '1' : undefined} value={r.amount} placeholder="0.00" onChange={(e) => setRow(i, { amount: e.target.value.replace(/[^\d.]/g, '') })} aria-label="Amount" />
                      <button className="btn ghost icon-btn sm" disabled={form.rows.length === 1} onClick={() => setForm({ ...form, rows: form.rows.filter((_, j) => j !== i) })} aria-label="Remove line"><Icon name="x" /></button>
                    </div>
                  ))}
                  <button className="btn sm" onClick={addRow}><Icon name="plus" />Add line</button>
                </div>
              </>
            )}

            {mode === 'journal' && (
              <div className="acc-lines">
                <div className="acc-lines-head j"><span>Dr / Cr</span><span>Particulars</span><span className="num">Amount (₹)</span><span /></div>
                {form.rows.map((r, i) => (
                  <div className="acc-line j" key={i}>
                    <select className="input" data-f="1" value={r.side} onChange={(e) => setRow(i, { side: e.target.value })} aria-label="Dr or Cr"><option value="dr">Dr</option><option value="cr">Cr</option></select>
                    <div><LedgerInput value={r.ledger} onChange={(v) => setRow(i, { ledger: v })} options={set.all} listId="dl-all" dataF="1" /><span className="curbal">{cur(r.ledger) && `Cur Bal: ${cur(r.ledger)}`}</span></div>
                    <input className="input num" inputMode="decimal" data-f="1" data-last={i === form.rows.length - 1 ? '1' : undefined} value={r.amount} placeholder="0.00" onChange={(e) => setRow(i, { amount: e.target.value.replace(/[^\d.]/g, '') })} aria-label="Amount" />
                    <button className="btn ghost icon-btn sm" disabled={form.rows.length <= 2} onClick={() => setForm({ ...form, rows: form.rows.filter((_, j) => j !== i) })} aria-label="Remove line"><Icon name="x" /></button>
                  </div>
                ))}
                <button className="btn sm" onClick={addRow}><Icon name="plus" />Add line</button>
              </div>
            )}

            {mode === 'invoice' && (
              <div className="grid g2">
                <div style={{ gridColumn: '1 / -1' }}><Field label={LABELS[type][0]}><div className="row"><div className="grow"><LedgerInput value={form.party} onChange={(v) => setForm({ ...form, party: v })} options={set.party(type)} listId={`dl-party-${type}`} dataF="1" autoFocus /></div><span className="curbal">{cur(form.party) && `Cur Bal: ${cur(form.party)}`}</span></div></Field></div>
                <div style={{ gridColumn: '1 / -1' }}><Field label={LABELS[type][1]}><LedgerInput value={form.main} onChange={(v) => setForm({ ...form, main: v })} options={set.main(type)} listId={`dl-main-${type}`} dataF="1" /></Field></div>
                <Field label="Amount before GST (₹)"><input className="input num" inputMode="decimal" data-f="1" value={form.taxable} placeholder="0.00" onChange={(e) => setForm({ ...form, taxable: e.target.value.replace(/[^\d.]/g, '') })} /></Field>
                <Field label="GST rate"><select className="input" data-f="1" value={form.rate} onChange={(e) => setForm({ ...form, rate: Number(e.target.value) })}><option value={0}>No GST</option>{GST_RATES.map((r) => <option key={r} value={r}>{r}%</option>)}</select></Field>
                <div style={{ gridColumn: '1 / -1' }}><Field label="GST type" hint="Auto: inter-state when the party's state differs from yours"><select className="input" data-f="1" data-last="1" value={form.gstType} onChange={(e) => setForm({ ...form, gstType: e.target.value })}><option value="auto">Auto from the party's state</option><option value="intra">Intra-state (CGST + SGST)</option><option value="inter">Inter-state (IGST)</option></select></Field></div>
              </div>
            )}

            <Field label="Narration"><textarea className="input" rows={2} value={form.narration} placeholder="e.g. Paid electricity bill for October" onChange={(e) => setForm({ ...form, narration: e.target.value })} /></Field>

            {built.lines.length > 0 && (
              <div className="acc-preview">
                <div className="small muted strong" style={{ marginBottom: 6 }}>ACCOUNTING ENTRY</div>
                <table className="t"><tbody>
                  {built.lines.map((l, i) => <tr key={i}><td style={{ width: 36 }}><span className={`drcr ${l.dr ? 'dr' : 'cr'}`}>{l.dr ? 'Dr' : 'Cr'}</span></td><td>{names.get(l.ledger)?.name}</td><td className="num">{l.dr ? num2(l.dr) : ''}</td><td className="num">{l.cr ? num2(l.cr) : ''}</td></tr>)}
                </tbody><tfoot><tr><td /><td>Total</td><td className="num">{num2(totalDr)}</td><td className="num">{num2(totalCr)}</td></tr></tfoot></table>
              </div>
            )}
            {built.warn.map((w) => <div key={w} className="alert warn"><Icon name="alert" />{w}</div>)}
            {built.lines.length > 0 && Math.abs(totalDr - totalCr) > 0.005 && <div className="alert bad"><Icon name="alert" />Debit and credit differ by {num2(Math.abs(totalDr - totalCr))}.</div>}
          </div>
          <div className="acc-foot">
            <span className="small muted"><kbd>Enter</kbd> next field · <kbd>Ctrl</kbd>+<kbd>A</kbd> accept · <kbd>Esc</kbd> clear · <kbd>F4</kbd>–<kbd>F9</kbd> voucher type</span>
            <div className="grow" />
            <button className="btn" onClick={() => reset()}>Clear</button>
            <button className="btn primary lg" onClick={save} disabled={!canPost} title={canPost ? '' : 'Only Accounts and the owner can post vouchers'}><Icon name="check" />{form.id ? 'Update voucher' : 'Accept'}</button>
          </div>
        </div>

        <div className="grid" style={{ gap: 14, alignContent: 'start' }}>
          <div className="card">
            <div className="card-head">
              <div><h3>Day summary</h3><p>{new Date(form.date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p></div>
              <div className="row" style={{ gap: 2 }}>
                <button className="btn ghost icon-btn sm" onClick={() => shiftDay(-1)} aria-label="Previous day"><Icon name="chevronLeft" /></button>
                <button className="btn ghost sm" onClick={() => setForm({ ...form, date: localDate() })}>Today</button>
                <button className="btn ghost icon-btn sm" onClick={() => shiftDay(1)} aria-label="Next day"><Icon name="chevronRight" /></button>
              </div>
            </div>
            <div className="table-wrap"><table className="t"><thead><tr><th /><th className="num">Opening</th><th className="num">Received</th><th className="num">Paid</th><th className="num">Closing</th></tr></thead><tbody>
              {[['Cash', day.cash], ['Bank', day.bank]].map(([n, b]) => <tr key={n}><td className="strong">{n}</td><td className="num">{num2(b.open)}</td><td className="num" style={{ color: 'var(--ok)' }}>{num2(b.dr)}</td><td className="num" style={{ color: 'var(--bad)' }}>{num2(b.cr)}</td><td className="num strong">{num2(b.close)}</td></tr>)}
            </tbody></table></div>
          </div>
          <div className="card">
            <div className="card-head"><h3>Vouchers entered</h3><span className="badge blue">{day.manual.length}</span></div>
            {day.manual.map((v) => (
              <div className="list-row" key={v.id}>
                <TypeBadge type={v.type} />
                <button className="grow small day-link" onClick={() => setView(v)}><b>{v.no}</b> · {particulars(v, names)}<div className="muted">{v.narration}</div></button>
                <b className="small">{num2(voucherTotal(v))}</b>
                {canPost && <><button className="btn ghost icon-btn sm" onClick={() => edit(v)} aria-label="Edit voucher"><Icon name="edit" /></button><button className="btn ghost icon-btn sm" onClick={() => remove(v)} aria-label="Delete voucher"><Icon name="trash" style={{ color: 'var(--bad)' }} /></button></>}
              </div>
            ))}
            {!day.manual.length && <Empty icon="book" text="No vouchers entered for this date yet." />}
            {day.auto.length > 0 && <div className="small muted card-body" style={{ borderTop: '1px solid var(--line-2)' }}>{day.auto.length} bill(s) and receipt(s) were posted automatically from billing. <a href="#/accdb" onClick={() => { sessionStorage.setItem('stc-acc-day', JSON.stringify(form.date)); }}>View in Day Book</a></div>}
          </div>
        </div>
      </div>

      <datalist id="dl-all">{set.all.map((l) => <option key={l.id} value={l.name} />)}</datalist>
      <datalist id="dl-cb">{set.cb.map((l) => <option key={l.id} value={l.name} />)}</datalist>
      <datalist id={`dl-party-${type}`}>{set.party(type).map((l) => <option key={l.id} value={l.name} />)}</datalist>
      <datalist id={`dl-main-${type}`}>{set.main(type).map((l) => <option key={l.id} value={l.name} />)}</datalist>
      {view && <VoucherView v={view} onClose={() => setView(null)} onEdit={edit} />}
      {newLedger && <LedgerForm onClose={() => setNewLedger(false)} onSaved={() => toast('Ledger created — it is now available in the lists')} />}
    </div>
  );
}
export { go };
