import { MONTHS, STAGES, serviceByName, serviceLabel } from './constants';
import { formToLines, nextVoucherNo, voucherSide, voucherTotal, type VForm } from './books';
import { normalize, getState, mutate, replaceAll } from './store';
import type {
  Activity, ActivityKind, AppData, Client, Dept, Lead, LeadStage, Voucher,
} from './types';
import { addDays, m2, nowTime, today } from './utils';
import { qLabel } from './filings';

const id = (d: AppData) => d.seq++;

export function log(d: AppData, dept: Dept, k: ActivityKind, x: string, date?: string) {
  const a: Activity = { id: id(d), dept, d: date || today(), t: nowTime(), k, x };
  d.activity.push(a);
}

const prefixOf = (service: string) => {
  for (const dept of ['accounts', 'trading'] as const) {
    const s = serviceByName(dept, service);
    if (s) return s.prefix;
  }
  return 'O';
};

export function genSerial(d: AppData, service: string) {
  const p = prefixOf(service);
  const re = new RegExp('^' + p + '-(\\d+)$');
  let m = 0;
  for (const c of [...d.clients, ...d.deleted]) {
    const x = String(c.serial || '').match(re);
    if (x) m = Math.max(m, Number(x[1]));
  }
  return p + '-' + String(m + 1).padStart(3, '0');
}

/** Every client gets a "Sundry Debtors" ledger (same name) in the department's books. */
function ensureClientLedger(d: AppData, c: Client) {
  const n = c.name.trim().toLowerCase();
  if (!d.ledgers.some((l) => l.dept === c.type && l.name.toLowerCase() === n))
    d.ledgers.push({ id: id(d), dept: c.type, name: c.name, group: 'Sundry Debtors', open: 0 });
}

// ---------------------------------------------------------------- vouchers
export function saveVoucher(dept: Dept, f: VForm): { error: string } | { no: number; altered: boolean } {
  const r = formToLines(getState(), dept, f);
  if ('error' in r) return r;
  return mutate((d) => {
    const desc = (v: Voucher) => `${v.type} voucher no. ${v.no}`;
    if (f.editId) {
      const v = d.vouchers.find((x) => x.id === f.editId);
      if (v) {
        if (v.type !== f.type) v.no = nextVoucherNo(d, dept, f.type);
        Object.assign(v, { type: f.type, date: f.date, narr: f.narr, lines: r.lines });
        log(d, dept, 'Voucher', `${desc(v)} altered — ${voucherSide(d, v, 'dr')} to ${voucherSide(d, v, 'cr')} · ₹${m2(voucherTotal(v))}`, v.date);
        return { no: v.no, altered: true };
      }
    }
    const v: Voucher = { id: id(d), dept, type: f.type, no: nextVoucherNo(d, dept, f.type), date: f.date, narr: f.narr, lines: r.lines };
    d.vouchers.push(v);
    log(d, dept, 'Voucher', `${desc(v)} saved — ${voucherSide(d, v, 'dr')} to ${voucherSide(d, v, 'cr')} · ₹${m2(voucherTotal(v))}`, v.date);
    return { no: v.no, altered: false };
  });
}

export function deleteVoucher(vid: number) {
  mutate((d) => {
    const v = d.vouchers.find((x) => x.id === vid);
    if (!v) return;
    d.vouchers = d.vouchers.filter((x) => x.id !== vid);
    log(d, v.dept, 'Voucher', `${v.type} voucher no. ${v.no} deleted`, v.date);
  });
}

// ---------------------------------------------------------------- ledgers
export function saveLedger(dept: Dept, f: { id?: number; name: string; group: string; open: number }): string | null {
  const name = f.name.trim();
  if (!name) return 'Enter a ledger name';
  const d0 = getState();
  if (d0.ledgers.some((l) => l.dept === dept && l.id !== f.id && l.name.toLowerCase() === name.toLowerCase()))
    return 'A ledger with this name already exists';
  mutate((d) => {
    if (f.id) {
      const l = d.ledgers.find((x) => x.id === f.id);
      if (l) Object.assign(l, { name, group: f.group, open: f.open });
    } else d.ledgers.push({ id: id(d), dept, name, group: f.group, open: f.open });
  });
  return null;
}

export function deleteLedger(lid: number): string | null {
  const d0 = getState();
  if (d0.vouchers.some((v) => v.lines.some((y) => y.l === lid))) return 'This ledger has vouchers — delete or alter them first';
  mutate((d) => { d.ledgers = d.ledgers.filter((l) => l.id !== lid); });
  return null;
}

export function addStarterLedgers(dept: Dept, list: [string, string][]) {
  mutate((d) => {
    for (const [name, group] of list)
      if (!d.ledgers.some((l) => l.dept === dept && l.name.toLowerCase() === name.toLowerCase()))
        d.ledgers.push({ id: id(d), dept, name, group, open: 0 });
  });
}

// ---------------------------------------------------------------- catalog clients (Accounts / Trading)
export type ClientFields = Pick<Client, 'name' | 'businessName' | 'detail' | 'regNo' | 'dateGiven' | 'loginId' | 'password' | 'status' | 'dueDate' | 'phone' | 'email' | 'notes' | 'serial'>;

export function saveCatalogClient(dept: Dept, service: string, cid: number | null, f: ClientFields) {
  mutate((d) => {
    const stamp = new Date().toISOString();
    if (cid) {
      const c = d.clients.find((x) => x.id === cid);
      if (c) {
        Object.assign(c, f, { lastUpdated: stamp });
        ensureClientLedger(d, c);
        log(d, dept, 'Client', `${serviceLabel(service)} client updated: ${f.name}`);
      }
      return;
    }
    const c: Client = { id: id(d), type: dept, service, ...f, serial: f.serial || genSerial(d, service), lastUpdated: stamp };
    d.clients.push(c);
    ensureClientLedger(d, c);
    log(d, dept, 'Client', `${serviceLabel(service)} client added: ${f.name}`);
  });
}

const find = (d: AppData, cid: number) => d.clients.find((x) => x.id === cid);
const touch = (c: Client) => { c.lastUpdated = new Date().toISOString(); };

export function setClientStatus(cid: number, status: string) {
  mutate((d) => { const c = find(d, cid); if (!c) return; c.status = status; touch(c); log(d, c.type, 'Client', `${c.name} · status → ${status}`); });
}
export function setClientPayment(cid: number, pay: string) {
  mutate((d) => { const c = find(d, cid); if (!c) return; c.pay = pay; touch(c); log(d, c.type, 'Client', `${c.name} · payment → ${pay}`); });
}

export function deleteClient(cid: number) {
  mutate((d) => {
    const c = find(d, cid);
    if (!c) return;
    d.clients = d.clients.filter((x) => x.id !== cid);
    d.deleted.push({ ...c, deletedAt: new Date().toISOString() });
    log(d, c.type, 'Client', `Moved to Deleted: ${c.name}`);
  });
}
export function restoreClient(cid: number) {
  mutate((d) => {
    const c = d.deleted.find((x) => x.id === cid);
    if (!c) return;
    d.deleted = d.deleted.filter((x) => x.id !== cid);
    delete c.deletedAt;
    d.clients.push(c);
    log(d, c.type, 'Client', `Restored: ${c.name}`);
  });
}
export function purgeClient(cid: number) {
  mutate((d) => { d.deleted = d.deleted.filter((x) => x.id !== cid); });
}

// ---------------------------------------------------------------- filings
export function setGst(cid: number, key: string, field: 'gstr1' | 'gstr3b' | 'payment', val: string) {
  mutate((d) => {
    const c = find(d, cid);
    if (!c) return;
    const together = d.settings.gstTogether && (field === 'gstr1' || field === 'gstr3b');
    c.gstFiling = c.gstFiling || {};
    const cur = c.gstFiling[key] || {};
    c.gstFiling[key] = { ...cur, ...(together ? { gstr1: val, gstr3b: val } : { [field]: val }) };
    touch(c);
    const [y, m] = key.split('-').map(Number);
    log(d, c.type, 'Filing', `${c.name} · GST ${MONTHS[m - 1]} ${y}: ${together ? 'GSTR-1 & GSTR-3B' : field === 'payment' ? 'client payment' : field === 'gstr1' ? 'GSTR-1' : 'GSTR-3B'} → ${val}`);
  });
}
export function setGstTogether(on: boolean) { mutate((d) => { d.settings.gstTogether = on; }); }

export function setItr(cid: number, year: number, field: 'filed' | 'payment', val: string) {
  mutate((d) => {
    const c = find(d, cid);
    if (!c) return;
    c.itrFiling = c.itrFiling || {};
    c.itrFiling[String(year)] = { ...(c.itrFiling[String(year)] || {}), [field]: val };
    touch(c);
    log(d, c.type, 'Filing', `${c.name} · ITR FY ${year - 1}-${String(year).slice(-2)}: ${field === 'filed' ? 'filing' : 'client payment'} → ${val}`);
  });
}
export function setTdsQuarter(cid: number, fy: number, q: number, field: 'ret' | 'fee', val: string) {
  mutate((d) => {
    const c = find(d, cid);
    if (!c) return;
    const key = `${fy}-Q${q}`;
    c.tdsQtr = c.tdsQtr || {};
    c.tdsQtr[key] = { ...(c.tdsQtr[key] || {}), [field]: val };
    touch(c);
    log(d, c.type, 'Filing', `${c.name} · TDS ${qLabel(fy, q)}: ${field === 'ret' ? 'return' : 'client payment'} → ${val}`);
  });
}
export function setTdsMonth(cid: number, key: string, val: string) {
  mutate((d) => {
    const c = find(d, cid);
    if (!c) return;
    c.tdsFiling = c.tdsFiling || {};
    c.tdsFiling[key] = { pay: val };
    touch(c);
    const [y, m] = key.split('-').map(Number);
    log(d, c.type, 'Filing', `${c.name} · TDS challan ${MONTHS[m - 1]} ${y} → ${val}`);
  });
}
const PAN_LABEL: Record<string, string> = {
  type: 'application type', ack: 'acknowledgement no.', applied: 'applied on', status: 'application status', delivered: 'delivered on', payment: 'client payment',
};
export function setPan(cid: number, field: string, val: string) {
  mutate((d) => {
    const c = find(d, cid);
    if (!c) return;
    c.panApp = { ...(c.panApp || {}), [field]: val };
    if (field === 'status' && val === 'Delivered' && !c.panApp.delivered) c.panApp.delivered = today();
    touch(c);
    log(d, c.type, 'Filing', `${c.name} · PAN ${PAN_LABEL[field] || field} → ${val}`);
  });
}

// ---------------------------------------------------------------- Digital Marketing clients
export function saveMarketingClient(f: { name: string; service: string; fee: number }) {
  mutate((d) => {
    const c: Client = { id: id(d), type: 'marketing', name: f.name || 'New client', service: f.service || '—', fee: f.fee, due: addDays(30), status: 'active' };
    d.clients.push(c);
    ensureClientLedger(d, c);
    log(d, 'marketing', 'Client', `Client added: ${c.name}`);
  });
}
export function toggleMarketingStatus(cid: number) {
  mutate((d) => {
    const c = find(d, cid);
    if (!c) return;
    c.status = c.status === 'active' ? 'paused' : 'active';
    log(d, 'marketing', 'Client', `${c.name} · ${c.status === 'active' ? 'resumed' : 'paused'}`);
  });
}

// ---------------------------------------------------------------- leads (CRM)
export function addLead(dept: Dept, f: { name: string; phone: string; source: string; service: string; value: number; next: string; note: string }) {
  mutate((d) => {
    const l: Lead = {
      id: id(d), dept, name: f.name || 'New lead', phone: f.phone, source: f.source, service: f.service, value: f.value,
      stage: 'new', next: f.next, notes: f.note ? [{ d: today(), t: f.note }] : [], cid: null,
    };
    d.leads.push(l);
    log(d, dept, 'Lead', `New lead added: ${l.name} (${l.service})`);
  });
}

const stageName = (s: LeadStage) => STAGES.find((x) => x[0] === s)?.[1] ?? s;
function applyStage(l: Lead, s: LeadStage) {
  l.stage = s;
  if (s === 'won' && !l.wonOn) l.wonOn = today();
  if (s === 'won' || s === 'lost') l.next = '';
}
export function setLeadStage(lid: number, stage: LeadStage) {
  mutate((d) => {
    const l = d.leads.find((x) => x.id === lid);
    if (!l || l.stage === stage) return;
    const old = l.stage;
    applyStage(l, stage);
    log(d, l.dept, 'Lead', `${l.name}: stage ${stageName(old)} → ${stageName(stage)}`);
  });
}
export function updateLead(lid: number, f: { stage: LeadStage; next: string; note: string }) {
  mutate((d) => {
    const l = d.leads.find((x) => x.id === lid);
    if (!l) return;
    const old = l.stage;
    applyStage(l, f.stage);
    if (['new', 'contacted', 'proposal'].includes(f.stage)) l.next = f.next;
    if (f.note) l.notes.push({ d: today(), t: f.note });
    if (old !== l.stage) log(d, l.dept, 'Lead', `${l.name}: stage ${stageName(old)} → ${stageName(l.stage)}`);
    if (f.note) log(d, l.dept, 'Lead', `${l.name}: ${f.note}`);
  });
}

export function convertLead(lid: number) {
  mutate((d) => {
    const l = d.leads.find((x) => x.id === lid);
    if (!l || l.cid) return;
    let c: Client;
    if (l.dept === 'marketing') {
      c = { id: id(d), type: 'marketing', name: l.name, service: l.service, fee: l.value, due: addDays(30), status: 'active' };
    } else {
      c = {
        id: id(d), type: l.dept, name: l.name, service: l.service, serial: genSerial(d, l.service), businessName: '', detail: '',
        dateGiven: today(), loginId: '', password: '', status: 'Active', dueDate: '', phone: l.phone, email: '',
        notes: 'Converted from lead', lastUpdated: new Date().toISOString(),
      };
    }
    d.clients.push(c);
    ensureClientLedger(d, c);
    l.cid = c.id;
    applyStage(l, 'won');
    l.notes.push({ d: today(), t: 'Converted to client' });
    log(d, l.dept, 'Lead', `${l.name} converted to a client (${l.service})`);
    log(d, l.dept, 'Client', `Client added from lead: ${l.name}`);
  });
}

// ---------------------------------------------------------------- backup / restore
export function exportBackup() {
  const d = getState();
  return {
    app: 'DTA Client Data Tracker', version: 1, exportedOn: new Date().toISOString(),
    clients: d.clients, leads: d.leads, deleted: d.deleted, ledgers: d.ledgers, vouchers: d.vouchers, activity: d.activity,
    settings: d.settings,
  };
}
export function importBackup(raw: unknown): string | null {
  const o = raw as Partial<AppData> | null;
  if (!o || !Array.isArray(o.clients) || !Array.isArray(o.ledgers) || !Array.isArray(o.vouchers))
    return 'That file is not a valid DTA backup';
  replaceAll(normalize({ ...o, seq: 0 }));
  return null;
}
export function resetAll() { replaceAll(normalize({})); }
