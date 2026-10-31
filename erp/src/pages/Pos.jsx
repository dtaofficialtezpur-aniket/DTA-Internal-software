import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { useStore } from '../lib/store.jsx';
import { loyaltyOf, approversFor, basePrice, computeBill, creditCheck, creditScore, customerLedger, discountLimit, groupDiscount, offerFor, unitFactor, upiLink, waLink } from '../lib/calc.js';
import { money, qty, round2, dateTime, uid, nowIso } from '../lib/format.js';
import { postInvoice, sessionSummary } from '../lib/ops.js';
import { printGstInvoice, printThermal } from '../lib/print.js';
import { ApprovalModal, Empty, Field, Icon, Modal, PageHead, Search } from '../components/ui.jsx';

const MODES = [['cash', 'Cash'], ['upi', 'UPI'], ['cheque', 'Cheque'], ['bank', 'Bank'], ['credit', 'Credit']];

export default function Pos() {
  const { db, user } = useStore();
  const session = db.sessions.find((s) => s.userId === user.id && !s.closedAt);
  const [closing, setClosing] = useState(false);

  if (!session) return <OpenSession />;
  return (
    <div className="page">
      <PageHead title="Point of Sale" sub={`Session opened ${dateTime(session.openedAt)} · Opening cash ${money(session.openingCash)}`}>
        <button className="btn" onClick={() => setClosing(true)}><Icon name="lock" />Close session</button>
      </PageHead>
      <Counter session={session} />
      {closing && <CloseSession session={session} onClose={() => setClosing(false)} />}
    </div>
  );
}

function OpenSession() {
  const { user, update, toast } = useStore();
  const [cash, setCash] = useState('');
  const open = () => {
    update((d) => { d.sessions.push({ id: uid('ses'), userId: user.id, userName: user.name, openedAt: nowIso(), openingCash: Number(cash) || 0 }); },
      ['Opened cashier session', 'Session', `Opening cash ${money(cash)}`]);
    toast('Session opened');
  };
  return (
    <div className="page" style={{ maxWidth: 460, margin: '40px auto' }}>
      <div className="card">
        <div className="card-body grid" style={{ gap: 16, padding: 28 }}>
          <span className="mini-ic gold" style={{ width: 46, height: 46 }}><Icon name="clock" /></span>
          <div><h2>Open cashier session</h2><p className="muted" style={{ marginTop: 4 }}>Count the cash in the drawer before billing starts. It is matched against sales when the session closes.</p></div>
          <Field label="Opening cash in drawer (₹)"><input className="input num" style={{ height: 44, fontSize: 16 }} inputMode="decimal" autoFocus value={cash} onChange={(e) => setCash(e.target.value.replace(/[^\d.]/g, ''))} onKeyDown={(e) => e.key === 'Enter' && open()} /></Field>
          <button className="btn primary lg block" onClick={open}>Start session</button>
        </div>
      </div>
    </div>
  );
}

function CloseSession({ session, onClose }) {
  const { db, update, toast } = useStore();
  const sum = sessionSummary(db, session);
  const [counted, setCounted] = useState('');
  const diff = round2((Number(counted) || 0) - sum.expectedCash);
  const close = () => {
    update((d) => {
      const s = d.sessions.find((x) => x.id === session.id);
      Object.assign(s, { closedAt: nowIso(), closingCash: Number(counted) || 0, expectedCash: sum.expectedCash, diff, summary: sum });
    }, ['Closed cashier session', 'Session', `Expected ${money(sum.expectedCash)}, counted ${money(counted)}, difference ${money(diff)}`]);
    toast('Session closed');
    onClose();
  };
  return (
    <Modal title="Close session" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={close} disabled={counted === ''}>Close session</button></>}>
      <table className="t"><tbody>
        <tr><td>Bills</td><td className="num">{sum.count}</td></tr>
        <tr><td>Sales value</td><td className="num">{money(sum.total)}</td></tr>
        {MODES.filter(([k]) => k !== 'credit').map(([k, l]) => <tr key={k}><td>{l} received</td><td className="num">{money(sum.byMode[k] || 0)}</td></tr>)}
        <tr><td>Given on credit</td><td className="num">{money(sum.credit)}</td></tr>
        <tr><td><b>Expected cash in drawer</b></td><td className="num"><b>{money(sum.expectedCash)}</b></td></tr>
      </tbody></table>
      <div className="grid mt">
        <Field label="Cash counted (₹)"><input className="input num" autoFocus inputMode="decimal" value={counted} onChange={(e) => setCounted(e.target.value.replace(/[^\d.]/g, ''))} /></Field>
        {counted !== '' && <div className={`alert ${Math.abs(diff) < 1 ? 'ok' : 'warn'}`}><Icon name={Math.abs(diff) < 1 ? 'check' : 'alert'} />{Math.abs(diff) < 1 ? 'Cash matches.' : `Difference of ${money(diff)} will be recorded.`}</div>}
      </div>
    </Modal>
  );
}

function Counter({ session }) {
  const { db, user, update, toast } = useStore();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('All');
  const [customerId, setCustomerId] = useState('walkin');
  const [lines, setLines] = useState([]);
  const [billDisc, setBillDisc] = useState(0);
  const [payments, setPayments] = useState([{ mode: 'cash', amount: '' }]);
  const [approval, setApproval] = useState(null);
  const [override, setOverride] = useState(null);
  const [ask, setAsk] = useState(null);
  const [done, setDone] = useState(null);
  const [redeem, setRedeem] = useState(0);

  const customer = db.customers.find((c) => c.id === customerId);
  const cats = ['All', ...new Set(db.products.map((p) => p.category))];
  const products = db.products.filter((p) => p.active !== false && (cat === 'All' || p.category === cat) &&
    (p.name + p.sku).toLowerCase().includes(q.toLowerCase()));

  // Re-price lines whenever the customer changes (their group decides the pricelist).
  const priced = useMemo(() => lines.map((l) => {
    const p = db.products.find((x) => x.id === l.productId);
    const factor = unitFactor(p, l.unit);
    const offer = offerFor(db, p, l.qty * factor);
    return { ...l, name: p.name, hsn: p.hsn, gst: p.gst, factor, rate: round2(basePrice(db, p, customer) * factor), offerPct: offer?.discPct || 0, offerName: offer?.name, stock: p.stock };
  }), [lines, customer, db]);

  const bill = computeBill({ lines: priced, billDiscPct: Number(billDisc) || 0, groupDiscPct: groupDiscount(db, customer), interState: customer?.stateCode && customer.stateCode !== db.company.stateCode, roundOff: db.settings.roundOff });
  const lp = db.settings.loyalty;
  const loyalty = lp?.enabled && customer && customer.id !== 'walkin' ? loyaltyOf(db, customer.id) : null;
  const redeemPts = loyalty ? Math.min(redeem, loyalty.balance, Math.floor(bill.total / lp.pointValue)) : 0;
  const redeemValue = round2(redeemPts * (lp?.pointValue || 0));
  const paidNow = round2(redeemValue + payments.filter((p) => p.mode !== 'credit').reduce((s, p) => s + (Number(p.amount) || 0), 0));
  const due = round2(Math.max(0, bill.total - paidNow));
  const limit = discountLimit(db, user.role);
  const needsApproval = bill.manualDiscPct > limit + 0.001 && !(approval && approval.pct >= bill.manualDiscPct);
  const credit = due > 0 ? creditCheck(db, customer?.id === 'walkin' ? null : customer, due) : { ok: true };
  const blocked = !credit.ok && !override;
  const score = customer && customer.id !== 'walkin' ? creditScore(db, customer) : null;
  const ledger = customer ? customerLedger(db, customer.id) : null;

  // A bill changed after approval must be re-approved.
  useEffect(() => { if (approval && bill.manualDiscPct > approval.pct) setApproval(null); }, [bill.manualDiscPct, approval]);
  useEffect(() => { setOverride(null); }, [customerId, due]);
  useEffect(() => { setRedeem(0); }, [customerId]);

  const add = (p) => {
    const unit = p.units[0]?.unit && p.baseUnit === 'kg' ? p.units[0].unit : p.baseUnit;
    setLines((ls) => {
      const hit = ls.find((l) => l.productId === p.id && l.unit === unit);
      return hit ? ls.map((l) => (l === hit ? { ...l, qty: l.qty + 1 } : l)) : [...ls, { key: uid(), productId: p.id, unit, qty: 1, discPct: 0 }];
    });
  };
  const setLine = (key, patch) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const reset = () => { setLines([]); setBillDisc(0); setPayments([{ mode: 'cash', amount: '' }]); setApproval(null); setOverride(null); setCustomerId('walkin'); setRedeem(0); };

  const save = () => {
    if (!lines.length) return;
    if (needsApproval) return setAsk('discount');
    if (blocked) return setAsk('credit');
    const pays = payments.filter((p) => p.mode !== 'credit' && Number(p.amount) > 0).map((p) => ({ mode: p.mode, amount: Number(p.amount), ref: p.ref || '' }));
    if (redeemPts > 0) pays.push({ mode: 'points', amount: redeemValue, points: redeemPts, ref: 'Loyalty' });
    const inv = update((d) => postInvoice(d, { bill, customer, payments: pays, userId: user.id, sessionId: session.id, approval, override }),
      ['Created invoice', 'Invoice', `${customer.name} · ${money(bill.total)}${approval ? ` · discount ${bill.manualDiscPct}% approved by ${approval.byName}` : ''}${override ? ` · credit override by ${override.byName}: ${override.note}` : ''}`]);
    toast(`Invoice ${inv.no} saved`);
    setDone(inv);
    reset();
  };

  const fillFull = (mode) => setPayments([{ mode, amount: mode === 'credit' ? '' : String(round2(bill.total - redeemValue)) }]);

  return (
    <div className="pos">
      <div className="grid" style={{ gap: 14 }}>
        <div className="row wrap">
          <div className="grow" style={{ minWidth: 220 }}><Search value={q} onChange={setQ} placeholder="Search item or SKU" /></div>
          <select className="input" style={{ width: 'auto' }} value={cat} onChange={(e) => setCat(e.target.value)}>{cats.map((c) => <option key={c}>{c}</option>)}</select>
        </div>
        <div className="prod-grid">
          {products.map((p, i) => (
            <button key={p.id} className="prod" style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }} onClick={() => add(p)}>
              <div className="nm">{p.name}</div>
              <div className="pr">{money(basePrice(db, p, customer))}<span className="muted small"> / {p.baseUnit}</span></div>
              <div className="meta"><span>{p.sku}</span><span style={{ color: p.stock <= p.reorder ? 'var(--bad)' : undefined }}>{qty(p.stock)} {p.baseUnit}</span></div>
            </button>
          ))}
        </div>
        {!products.length && <Empty text="No items match your search." />}
      </div>

      <div className="card cart">
        <div className="card-head" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
          <div className="row between"><h3>Current bill</h3>{lines.length > 0 && <button className="btn sm ghost danger" onClick={reset}>Clear</button>}</div>
          <select className="input" value={customerId} onChange={(e) => setCustomerId(e.target.value)} aria-label="Customer">
            {db.customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {score && (
            <div className="row wrap small">
              <span className={`badge ${score.grade === 'A' ? 'ok' : score.grade === 'B' ? 'blue' : score.grade === 'C' ? 'warn' : 'bad'}`}>Credit score {score.score} · {score.grade}</span>
              <span className="muted">Outstanding {money(ledger.outstanding)} of {money(customer.creditLimit)}</span>
              {ledger.overdue.length > 0 && <span className="badge bad">{ledger.overdue.length} overdue</span>}
            </div>
          )}
        </div>

        <div style={{ maxHeight: '40vh', overflowY: 'auto' }}>
          {priced.map((l) => {
            const p = db.products.find((x) => x.id === l.productId);
            const line = bill.items.find((x) => x.key === l.key);
            return (
              <div className="cart-line" key={l.key}>
                <div className="row between">
                  <div className="small strong">{l.name}</div>
                  <button className="btn ghost icon-btn sm" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} aria-label="Remove"><Icon name="x" /></button>
                </div>
                <div className="grid3">
                  <select className="input sm" value={l.unit} onChange={(e) => setLine(l.key, { unit: e.target.value })}>
                    {[p.baseUnit, ...p.units.map((u) => u.unit)].map((u) => <option key={u} value={u}>{u}{u !== p.baseUnit ? ` (${unitFactor(p, u)} ${p.baseUnit})` : ''}</option>)}
                  </select>
                  <input className="input sm num" inputMode="decimal" value={l.qty} onChange={(e) => setLine(l.key, { qty: Number(e.target.value.replace(/[^\d.]/g, '')) || 0 })} aria-label="Quantity" />
                  <input className="input sm num" inputMode="decimal" value={l.discPct || ''} placeholder="Disc %" onChange={(e) => setLine(l.key, { discPct: Math.min(100, Number(e.target.value.replace(/[^\d.]/g, '')) || 0) })} aria-label="Item discount %" />
                </div>
                <div className="row between small" style={{ marginTop: 6 }}>
                  <span className="muted">{money(l.rate)} / {l.unit} · {qty(l.qty * l.factor)} {p.baseUnit}</span>
                  <b>{money(line?.taxable)}</b>
                </div>
                {l.offerName && <div className="small" style={{ color: 'var(--ok)' }}>Offer applied: {l.offerName} ({l.offerPct}%)</div>}
                {l.qty * l.factor > l.stock && <div className="small" style={{ color: 'var(--bad)' }}>Only {qty(l.stock)} {p.baseUnit} in stock</div>}
              </div>
            );
          })}
          {!lines.length && <Empty icon="pos" text="Tap an item to add it to the bill." />}
        </div>

        {lines.length > 0 && (
          <>
            <div className="totals">
              <div className="r"><span>Gross</span><span>{money(bill.gross)}</span></div>
              {bill.groupDisc > 0 && <div className="r"><span>Customer group &amp; offers</span><span>− {money(bill.groupDisc)}</span></div>}
              <div className="r" style={{ alignItems: 'center' }}>
                <span>Bill discount %</span>
                <input className="input sm num" style={{ width: 80 }} inputMode="decimal" value={billDisc || ''} placeholder="0" onChange={(e) => setBillDisc(Math.min(100, Number(e.target.value.replace(/[^\d.]/g, '')) || 0))} />
              </div>
              {bill.manualDisc > 0 && <div className="r"><span>Manual discount ({bill.manualDiscPct}%)</span><span>− {money(bill.manualDisc)}</span></div>}
              <div className="r"><span>Taxable value</span><span>{money(bill.taxable)}</span></div>
              <div className="r"><span>{bill.interState ? 'IGST' : 'CGST + SGST'}</span><span>{money(bill.tax)}</span></div>
              {bill.roundOff !== 0 && <div className="r"><span>Round off</span><span>{money(bill.roundOff)}</span></div>}
              <div className="r grand"><span>Total</span><span>{money(bill.total)}</span></div>
            </div>

            <div className="card-body grid" style={{ gap: 10 }}>
              {loyalty && (
                <div className="alert ok" style={{ alignItems: 'center' }}>
                  <Icon name="gift" />
                  <div className="grow"><b>{loyalty.tier}</b> member · {loyalty.balance} points (₹{(loyalty.balance * lp.pointValue).toLocaleString('en-IN')})</div>
                  {loyalty.balance >= lp.minRedeem && <input className="input sm num" style={{ width: 90 }} placeholder="Redeem" inputMode="numeric" value={redeem || ''} aria-label="Points to redeem"
                    onChange={(e) => setRedeem(Number(e.target.value.replace(/\D/g, '')) || 0)} />}
                </div>
              )}
              {redeemValue > 0 && <div className="small" style={{ color: 'var(--ok)' }}>{redeemPts} points redeemed: − {money(redeemValue)}</div>}
              <div className="pay-modes">
                {MODES.map(([k, l]) => <button key={k} className={`pay-mode ${payments.length === 1 && payments[0].mode === k ? 'on' : ''}`} onClick={() => fillFull(k)}>{l}</button>)}
              </div>
              {payments.map((p, i) => p.mode !== 'credit' && (
                <div className="row" key={i}>
                  <select className="input sm" style={{ width: 110 }} value={p.mode} onChange={(e) => setPayments(payments.map((x, j) => (j === i ? { ...x, mode: e.target.value } : x)))}>
                    {MODES.filter(([k]) => k !== 'credit').map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </select>
                  <input className="input sm num grow" inputMode="decimal" placeholder="Amount" value={p.amount} onChange={(e) => setPayments(payments.map((x, j) => (j === i ? { ...x, amount: e.target.value.replace(/[^\d.]/g, '') } : x)))} />
                  {['cheque', 'bank', 'upi'].includes(p.mode) && <input className="input sm" style={{ width: 96 }} placeholder="Ref no." value={p.ref || ''} onChange={(e) => setPayments(payments.map((x, j) => (j === i ? { ...x, ref: e.target.value } : x)))} />}
                  {payments.length > 1 && <button className="btn ghost icon-btn sm" onClick={() => setPayments(payments.filter((_, j) => j !== i))} aria-label="Remove payment"><Icon name="x" /></button>}
                </div>
              ))}
              <button className="btn sm ghost" style={{ justifySelf: 'start' }} onClick={() => setPayments([...payments.filter((p) => p.mode !== 'credit'), { mode: 'upi', amount: due ? String(due) : '' }])}><Icon name="plus" />Split payment</button>
              {payments.some((p) => p.mode === 'upi') && <UpiQr amount={payments.filter((p) => p.mode === 'upi').reduce((s, p) => s + (Number(p.amount) || 0), 0)} />}
              {due > 0 && <div className="alert info"><Icon name="wallet" /><div>Balance <b>{money(due)}</b> goes on credit, due in {customer.creditDays || 0} days.</div></div>}
              {due > 0 && !credit.ok && <div className={`alert ${override ? 'ok' : 'bad'}`}><Icon name={override ? 'check' : 'lock'} /><div>{override ? `Credit allowed by ${override.byName} (${override.note}).` : <>Credit billing blocked. {credit.reason} Owner override required.</>}</div></div>}
              {bill.manualDiscPct > 0 && <div className={`alert ${needsApproval ? 'warn' : 'ok'}`}><Icon name={needsApproval ? 'alert' : 'check'} /><div>{needsApproval ? `Discount ${bill.manualDiscPct}% is above your limit of ${limit}%. Approval needed.` : approval ? `Discount approved by ${approval.byName}.` : `Discount within your ${limit}% limit.`}</div></div>}
              <button className="btn primary lg block" onClick={save}>
                {needsApproval ? <><Icon name="lock" />Request approval</> : blocked ? <><Icon name="lock" />Owner override</> : <><Icon name="check" />Save bill · {money(bill.total)}</>}
              </button>
            </div>
          </>
        )}
      </div>

      {ask === 'discount' && (
        <ApprovalModal title="Discount approval" reason={`Manual discount of ${bill.manualDiscPct}% (${money(bill.manualDisc)}) exceeds the ${limit}% limit for ${user.name}.`}
          approvers={approversFor(db, bill.manualDiscPct).filter((a) => a.id !== user.id || user.role === 'owner')} onClose={() => setAsk(null)}
          onApproved={(a) => { setApproval({ ...a, pct: bill.manualDiscPct }); setAsk(null); toast('Discount approved'); }} />
      )}
      {ask === 'credit' && (
        <ApprovalModal title="Owner override — credit" reason={credit.reason} needNote
          approvers={db.users.filter((u) => u.role === 'owner' && u.active)} onClose={() => setAsk(null)}
          onApproved={(a) => { setOverride(a); setAsk(null); toast('Credit override recorded'); }} />
      )}
      {done && <AfterSave inv={done} onClose={() => setDone(null)} />}
    </div>
  );
}

function UpiQr({ amount }) {
  const { db } = useStore();
  const [src, setSrc] = useState('');
  useEffect(() => {
    if (db.company.upiId && amount > 0) QRCode.toDataURL(upiLink(db, amount, 'Bill payment'), { margin: 1, width: 360 }).then(setSrc);
  }, [amount, db]);
  if (!db.company.upiId) return <div className="alert warn small"><Icon name="info" />Set the shop's UPI ID in Settings to show a payment QR here.</div>;
  return src ? <div className="qr"><img src={src} alt="UPI payment QR" /><div className="small muted">Scan to pay {money(amount)} · {db.company.upiId}</div></div> : null;
}

function AfterSave({ inv, onClose }) {
  const { db } = useStore();
  const cust = db.customers.find((c) => c.id === inv.customerId);
  const msg = `Dear ${inv.customerName}, thank you for your purchase. Invoice ${inv.no} for ${money(inv.total)}${inv.total - inv.paid > 0.5 ? `, balance due ${money(inv.total - inv.paid)}` : ''}. — ${db.company.name}`;
  return (
    <Modal title="Bill saved" onClose={onClose} footer={<button className="btn primary" onClick={onClose}>New bill</button>}>
      <div className="grid" style={{ gap: 14, justifyItems: 'center', textAlign: 'center' }}>
        <span className="mini-ic green" style={{ width: 56, height: 56, borderRadius: '50%' }}><Icon name="check" style={{ width: 28, height: 28 }} /></span>
        <div><h2>{inv.no}</h2><p className="muted">{inv.customerName} · {money(inv.total)}</p></div>
        <div className="row wrap" style={{ justifyContent: 'center' }}>
          <button className="btn" onClick={() => printThermal(db, inv)}><Icon name="print" />Thermal receipt</button>
          <button className="btn" onClick={() => printGstInvoice(db, inv)}><Icon name="print" />A5 GST invoice</button>
          {cust?.phone && <a className="btn" href={waLink(cust.phone, msg)} target="_blank" rel="noreferrer"><Icon name="whatsapp" />Send on WhatsApp</a>}
        </div>
        <p className="small muted">A pick list has been sent to the warehouse.</p>
      </div>
    </Modal>
  );
}
