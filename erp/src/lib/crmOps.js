// CRM writes. Each takes the draft db passed to `update` and keeps the record timeline current.
import { nowIso, uid } from './format.js';
import { CRM_MODULES, DEAL_STAGES, describeChanges, shiftDate } from './crmMeta.js';

const log = (db, mod, recordId, by, text) => db.crm.timeline.unshift({ id: uid('tl'), module: mod, recordId, at: nowIso(), by, text });

// Activities, notes and edits mark the parent record as "touched".
function touch(db, ref, by, text) {
  const r = ref?.id && db.crm[ref.module]?.find((x) => x.id === ref.id);
  if (!r) return;
  r.touched = true;
  r.modifiedAt = nowIso();
  log(db, ref.module, r.id, by, text);
}

export function createRecord(db, mod, data, user) {
  const rec = { ...data, id: uid(mod.slice(0, 2)), createdAt: nowIso(), modifiedAt: nowIso(), createdBy: user.name, ownerId: data.ownerId || user.id, touched: false };
  if (mod === 'deals' && rec.stage && (rec.probability === '' || rec.probability == null)) rec.probability = DEAL_STAGES.find(([s]) => s === rec.stage)?.[1] ?? 10;
  db.crm[mod].unshift(rec);
  log(db, mod, rec.id, user.name, `${CRM_MODULES[mod].singular} created`);
  if (CRM_MODULES[mod].activity && rec.relatedTo?.id) touch(db, rec.relatedTo, user.name, `${CRM_MODULES[mod].singular} added: ${rec[CRM_MODULES[mod].title]}`);
  return rec;
}

export function updateRecord(db, mod, id, patch, user) {
  const rec = db.crm[mod].find((r) => r.id === id);
  if (!rec) return null;
  const before = { ...rec };
  Object.assign(rec, patch);
  // Moving a deal to a new stage takes that stage's default probability unless it was set explicitly.
  if (mod === 'deals' && patch.stage && patch.stage !== before.stage && !('probability' in patch)) rec.probability = DEAL_STAGES.find(([s]) => s === patch.stage)?.[1] ?? rec.probability;
  const changes = describeChanges(db, mod, before, rec);
  if (!changes.length) return rec;
  rec.modifiedAt = nowIso();
  rec.touched = true;
  log(db, mod, id, user.name, changes.join(' · '));
  if (CRM_MODULES[mod].activity && rec.relatedTo?.id && patch.status && patch.status !== before.status) touch(db, rec.relatedTo, user.name, `${CRM_MODULES[mod].singular} "${rec[CRM_MODULES[mod].title]}" marked ${patch.status}`);
  return rec;
}

export function deleteRecords(db, mod, ids) {
  const set = new Set(ids);
  db.crm[mod] = db.crm[mod].filter((r) => !set.has(r.id));
  db.crm.notes = db.crm.notes.filter((n) => !(n.module === mod && set.has(n.recordId)));
}

export function addNote(db, mod, recordId, text, user) {
  db.crm.notes.unshift({ id: uid('nt'), module: mod, recordId, at: nowIso(), by: user.name, text });
  touch(db, { module: mod, id: recordId }, user.name, 'Note added');
}

// Lead conversion: account (new or existing), contact, optional deal, optional billing customer.
export function convertLead(db, leadId, opts, user) {
  const lead = db.crm.leads.find((l) => l.id === leadId);
  let accountId = opts.accountId;
  if (!accountId) accountId = createRecord(db, 'accounts', { name: opts.accountName || lead.company || lead.name, phone: lead.phone, email: lead.email, city: lead.city, industry: lead.industry, type: 'Contractor', rating: 'Regular', ownerId: lead.ownerId }, user).id;
  const contact = createRecord(db, 'contacts', { name: lead.name, accountId, title: lead.title, email: lead.email, phone: lead.phone, city: lead.city, source: lead.source, ownerId: lead.ownerId }, user);
  let deal = null;
  if (opts.deal) deal = createRecord(db, 'deals', { name: opts.dealName, accountId, contactId: contact.id, amount: Number(opts.amount) || 0, stage: opts.stage, closingDate: opts.closingDate || shiftDate(30), source: lead.source, campaignId: lead.campaignId, type: 'New Business', ownerId: lead.ownerId }, user);
  // Open activities follow the person to the new contact.
  for (const k of ['tasks', 'meetings', 'calls']) for (const a of db.crm[k]) if (a.relatedTo?.module === 'leads' && a.relatedTo.id === leadId) a.relatedTo = { module: 'contacts', id: contact.id };
  if (opts.customer) {
    const acc = db.crm.accounts.find((a) => a.id === accountId);
    if (!db.customers.some((c) => c.name === acc.name)) db.customers.push({ id: uid('c'), name: acc.name, phone: lead.phone || '', groupId: 'g-b2b', creditLimit: 0, creditDays: 0, stateCode: '18', address: lead.city || '' });
  }
  Object.assign(lead, { converted: true, status: 'Qualified', convertedTo: { accountId, contactId: contact.id, dealId: deal?.id }, modifiedAt: nowIso(), touched: true });
  log(db, 'leads', leadId, user.name, `Converted to account, contact${deal ? ' and deal' : ''}`);
  return { accountId, contactId: contact.id, dealId: deal?.id };
}
