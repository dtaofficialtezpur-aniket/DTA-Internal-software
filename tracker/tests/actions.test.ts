import { storage } from './setup';
import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import {
  addLead, convertLead, deleteClient, exportBackup, importBackup, restoreClient, saveCatalogClient, saveLedger, saveVoucher, setGst, setGstTogether, setLeadStage,
} from '../src/lib/actions';
import { newVoucherForm } from '../src/lib/books';
import { getState, replaceAll, emptyData, STORAGE_KEY } from '../src/lib/store';

const fields = (name: string) => ({ name, businessName: '', detail: '', regNo: '', dateGiven: '2026-01-01', loginId: '', password: '', status: 'Active', dueDate: '', phone: '98640', email: '', notes: '', serial: '' });
beforeEach(() => { storage.clear(); replaceAll(emptyData()); });

test('adding a client generates a serial, a debtor ledger and an activity entry', () => {
  saveCatalogClient('accounts', 'GST', null, fields('Acme'));
  saveCatalogClient('accounts', 'GST', null, fields('Beta'));
  const d = getState();
  assert.deepEqual(d.clients.map((c) => c.serial), ['G-001', 'G-002']);
  assert.ok(d.ledgers.some((l) => l.name === 'Acme' && l.group === 'Sundry Debtors' && l.dept === 'accounts'));
  assert.equal(d.activity.filter((a) => a.k === 'Client').length, 2);
  assert.ok(storage.get(STORAGE_KEY), 'persisted to localStorage');
});

test('GST returns fill together by default, independently when switched off', () => {
  saveCatalogClient('accounts', 'GST', null, fields('Acme'));
  const id = getState().clients[0].id;
  setGst(id, '2026-06', 'gstr1', 'Filed');
  assert.equal(getState().clients[0].gstFiling!['2026-06'].gstr3b, 'Filed');
  setGstTogether(false);
  setGst(id, '2026-07', 'gstr1', 'Filed');
  assert.notEqual(getState().clients[0].gstFiling!['2026-07'].gstr3b, 'Filed');
});

test('delete → restore keeps the record; vouchers are logged and validated', () => {
  saveCatalogClient('accounts', 'ITR', null, fields('Acme'));
  const id = getState().clients[0].id;
  deleteClient(id);
  assert.equal(getState().clients.length, 0);
  restoreClient(id);
  assert.equal(getState().clients[0].name, 'Acme');
  assert.equal(saveLedger('accounts', { name: 'Bank', group: 'Bank Accounts', open: 0 }), null);
  assert.match(saveLedger('accounts', { name: 'bank', group: 'Bank Accounts', open: 0 }) ?? '', /already exists/);
  const f = newVoucherForm(getState(), 'accounts', 'Payment', '2026-02-02');
  f.acct = 'Cash';
  f.rows[0] = { s: 'Dr', n: 'Bank', a: '10' };
  const r = saveVoucher('accounts', f);
  assert.ok('no' in r && r.no === 1);
  assert.equal(getState().activity.filter((a) => a.k === 'Voucher').length, 1);
});

test('leads move through stages and convert into a client exactly once', () => {
  addLead('trading', { name: 'Zed Foods', phone: '1', source: 'Referral', service: 'FSSAI License', value: 5000, next: '2026-03-01', note: 'called' });
  const lead = getState().leads[0];
  setLeadStage(lead.id, 'proposal');
  convertLead(lead.id);
  convertLead(lead.id);
  const d = getState();
  assert.equal(d.clients.length, 1);
  assert.equal(d.clients[0].serial, 'FS-001');
  assert.equal(d.leads[0].stage, 'won');
  assert.equal(d.leads[0].cid, d.clients[0].id);
});

test('backup round-trips and invalid files are refused', () => {
  saveCatalogClient('trading', 'Trade License', null, fields('Acme'));
  const backup = JSON.parse(JSON.stringify(exportBackup()));
  replaceAll(emptyData());
  assert.equal(importBackup(backup), null);
  assert.equal(getState().clients[0].name, 'Acme');
  assert.match(importBackup({ nope: 1 }) ?? '', /not a valid/);
});
