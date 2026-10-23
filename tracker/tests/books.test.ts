import './setup';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { balanceSheet, formToLines, newVoucherForm, profitLoss, trialBalance, ledgerStatement, findLedgerByName } from '../src/lib/books';
import { emptyData, normalize } from '../src/lib/store';
import type { AppData } from '../src/lib/types';

const fresh = (): AppData => {
  const d = emptyData();
  const add = (name: string, group: string, open = 0) => d.ledgers.push({ id: d.seq++, dept: 'accounts', name, group, open });
  add('SBI Bank A/c', 'Bank Accounts', 100000);
  add('Capital Account', 'Capital Account', -100000);
  add('Professional Fees', 'Direct Incomes');
  add('Office Rent', 'Indirect Expenses');
  add('Acme Ltd', 'Sundry Debtors');
  return d;
};
const post = (d: AppData, type: 'Payment' | 'Receipt' | 'Sales' | 'Journal' | 'Contra', fill: (f: ReturnType<typeof newVoucherForm>) => void) => {
  const f = newVoucherForm(d, 'accounts', type, '2026-01-10');
  fill(f);
  const r = formToLines(d, 'accounts', f);
  assert.ok('lines' in r, 'error' in r ? r.error : '');
  d.vouchers.push({ id: d.seq++, dept: 'accounts', type, no: d.vouchers.length + 1, date: f.date, narr: '', lines: r.lines });
};

test('a fresh data set has no records, only a Cash ledger per department', () => {
  const d = emptyData();
  assert.equal(d.clients.length + d.leads.length + d.vouchers.length + d.activity.length, 0);
  assert.deepEqual(d.ledgers.map((l) => [l.dept, l.name]), [['accounts', 'Cash'], ['marketing', 'Cash'], ['trading', 'Cash']]);
});

test('normalize repairs missing pieces and keeps ids unique', () => {
  const d = normalize({ clients: [{ id: 50, type: 'accounts', name: 'A', status: 'Active' }] });
  assert.ok(d.seq > 50);
  assert.equal(d.ledgers.filter((l) => l.name === 'Cash').length, 3);
});

test('payment / receipt / sales build balanced double-entry lines', () => {
  const d = fresh();
  post(d, 'Sales', (f) => { f.rows[0] = { s: 'Dr', n: 'Acme Ltd', a: '5000' }; f.rows[1] = { s: 'Cr', n: 'Professional Fees', a: '5000' }; });
  post(d, 'Receipt', (f) => { f.acct = 'SBI Bank A/c'; f.rows[0] = { s: 'Cr', n: 'Acme Ltd', a: '3000' }; });
  post(d, 'Payment', (f) => { f.acct = 'SBI Bank A/c'; f.rows[0] = { s: 'Dr', n: 'Office Rent', a: '1200' }; });
  for (const v of d.vouchers) assert.equal(v.lines.reduce((t, l) => t + l.dr, 0), v.lines.reduce((t, l) => t + l.cr, 0));
  const acme = findLedgerByName(d, 'accounts', 'acme ltd')!;
  assert.equal(ledgerStatement(d, acme).close, 2000); // 5000 billed - 3000 received
});

test('reports balance: trial balance, P&L and balance sheet', () => {
  const d = fresh();
  post(d, 'Sales', (f) => { f.rows[0] = { s: 'Dr', n: 'Acme Ltd', a: '5000' }; f.rows[1] = { s: 'Cr', n: 'Professional Fees', a: '5000' }; });
  post(d, 'Payment', (f) => { f.acct = 'SBI Bank A/c'; f.rows[0] = { s: 'Dr', n: 'Office Rent', a: '1200' }; });
  assert.ok(trialBalance(d, 'accounts').balanced);
  assert.equal(profitLoss(d, 'accounts').net, 3800);
  const bs = balanceSheet(d, 'accounts');
  assert.ok(bs.balanced);
  assert.equal(bs.assetTotal, 103800);
});

test('invalid entries are rejected with a helpful message', () => {
  const d = fresh();
  const j = newVoucherForm(d, 'accounts', 'Journal', '2026-01-10');
  j.rows = [{ s: 'Dr', n: 'Office Rent', a: '100' }, { s: 'Cr', n: 'SBI Bank A/c', a: '90' }];
  assert.match((formToLines(d, 'accounts', j) as { error: string }).error, /do not match/);
  j.rows[1].n = 'No Such Ledger';
  assert.match((formToLines(d, 'accounts', j) as { error: string }).error, /not found/);
  const c = newVoucherForm(d, 'accounts', 'Contra', '2026-01-10');
  c.acct = 'SBI Bank A/c';
  c.rows[0] = { s: 'Dr', n: 'Office Rent', a: '10' };
  assert.match((formToLines(d, 'accounts', c) as { error: string }).error, /Contra/);
});

test('each department keeps its own books', () => {
  const d = fresh();
  assert.equal(findLedgerByName(d, 'trading', 'SBI Bank A/c'), undefined);
  assert.ok(trialBalance(d, 'trading').balanced);
});
