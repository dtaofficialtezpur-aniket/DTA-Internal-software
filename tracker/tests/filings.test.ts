import './setup';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { accState, fyMonths, monthFil, panInfo, panState, qDue, qLabel, retSt, yearFil } from '../src/lib/filings';
import type { Client } from '../src/lib/types';
import { addDays } from '../src/lib/utils';

const base: Client = { id: 1, type: 'accounts', name: 'X', status: 'Active' };

test('a return is Overdue only after its due date and never when filed', () => {
  assert.equal(retSt('Filed', 2000, 0, 11), 'filed');
  assert.equal(retSt('N/A', 2000, 0, 11), 'na');
  assert.equal(retSt('Pending', 2000, 0, 11), 'overdue');
  assert.equal(retSt('Pending', 2999, 0, 11), 'pending');
});

test('GST months before the client was given are N/A, later months default to Pending/Unpaid', () => {
  const c: Client = { ...base, service: 'GST', dateGiven: '2026-05-20' };
  assert.equal(monthFil(c, '2026-04').gstr1, 'N/A');
  assert.deepEqual(monthFil(c, '2026-06'), { gstr1: 'Pending', gstr3b: 'Pending', payment: 'Unpaid' });
  c.gstFiling = { '2026-06': { gstr1: 'Filed' } };
  assert.equal(monthFil(c, '2026-06').gstr1, 'Filed');
  assert.equal(yearFil({ ...base, dateGiven: '2026-05-20' }, 2025).filed, 'N/A');
});

test('TDS quarter due dates', () => {
  assert.deepEqual(qDue(2026, 1), [2026, 6, 31]);
  assert.deepEqual(qDue(2026, 4), [2027, 4, 31]);
  assert.equal(qLabel(2026, 3), 'Oct–Dec 2026');
  assert.equal(qLabel(2026, 4), 'Jan–Mar 2027');
});

test('financial-year months run April to March', () => {
  const m = fyMonths(2026);
  assert.equal(m[0].key, '2026-04');
  assert.equal(m[11].key, '2027-03');
});

test('PAN and generic service status', () => {
  const pan: Client = { ...base, service: 'PAN', dueDate: addDays(-1) };
  assert.equal(panInfo(pan).status, 'Not started');
  assert.equal(panState(pan), 'overdue');
  assert.equal(panState({ ...pan, panApp: { status: 'Delivered' } }), 'filed');
  assert.equal(accState({ ...base, service: 'Trade License', dueDate: addDays(30) }), 'active');
  assert.equal(accState({ ...base, service: 'Trade License', dueDate: addDays(-2) }), 'overdue');
  assert.equal(accState({ ...base, service: 'Trade License', dueDate: addDays(-2), status: 'Completed' }), 'filed');
});
