// Metadata-driven CRM: every module is described by its fields, and the list, filter, sort, kanban,
// calendar, chart, form and detail screens are all generated from these definitions.
import { daysBetween, round2 } from './format.js';

const SOURCES = ['Walk-in', 'Phone', 'WhatsApp', 'Referral', 'Field visit', 'Govt. tender', 'Website', 'Trade show', 'Advertisement'];
const INDUSTRIES = ['Construction', 'Real estate', 'Infrastructure', 'Government', 'Industrial', 'Fabrication', 'Retail', 'Other'];

const owner = { key: 'ownerId', label: 'Owner', type: 'owner' };
const related = { key: 'relatedTo', label: 'Related to', type: 'related' };

export const DEAL_STAGES = [['Qualification', 10], ['Needs Analysis', 25], ['Quotation Sent', 50], ['Negotiation', 75], ['Closed Won', 100], ['Closed Lost', 0]];

export const CRM_MODULES = {
  leads: {
    label: 'Leads', singular: 'Lead', icon: 'target', title: 'name', subtitle: 'title',
    fields: [
      { key: 'name', label: 'Lead Name', type: 'text', required: true },
      { key: 'company', label: 'Company', type: 'text' },
      { key: 'title', label: 'Designation', type: 'text' },
      { key: 'email', label: 'Email', type: 'email' },
      { key: 'phone', label: 'Phone', type: 'phone' },
      { key: 'status', label: 'Lead Status', type: 'select', options: ['Not Contacted', 'Attempted to Contact', 'Contacted', 'Qualified', 'Junk Lead', 'Lost Lead'] },
      { key: 'rating', label: 'Rating', type: 'select', options: ['Hot', 'Warm', 'Cold'] },
      { key: 'source', label: 'Lead Source', type: 'select', options: SOURCES },
      { key: 'industry', label: 'Industry', type: 'select', options: INDUSTRIES },
      { key: 'value', label: 'Expected Value', type: 'currency' },
      { key: 'followUp', label: 'Next Follow-up', type: 'date' },
      { key: 'city', label: 'City', type: 'text' },
      { key: 'campaignId', label: 'Campaign', type: 'lookup', module: 'campaigns' },
      owner,
      { key: 'requirement', label: 'Requirement', type: 'textarea' },
    ],
    sections: [['Lead Information', ['name', 'company', 'title', 'email', 'phone', 'status', 'rating', 'source', 'industry', 'value', 'followUp', 'city', 'campaignId', 'ownerId']], ['Description', ['requirement']]],
    columns: ['name', 'company', 'email', 'phone', 'status', 'rating', 'ownerId'],
    kanban: ['status', 'rating', 'source'], calendar: 'followUp', chart: ['status', 'source', 'rating', 'industry'],
    views: [
      { id: 'mine', name: 'My Leads', filters: [{ field: 'ownerId', op: 'is', value: ['$me'] }] },
      { id: 'hot', name: 'Hot Leads', filters: [{ field: 'rating', op: 'is', value: ['Hot'] }] },
      { id: 'today', name: "Today's Leads", sys: ['createdToday'] },
      { id: 'followup', name: 'Follow-ups due', filters: [{ field: 'followUp', op: 'dueBy', value: '' }] },
      { id: 'open', name: 'Not Converted', sys: ['notConverted'] },
    ],
  },
  contacts: {
    label: 'Contacts', singular: 'Contact', icon: 'user', title: 'name', subtitle: 'title',
    fields: [
      { key: 'name', label: 'Contact Name', type: 'text', required: true },
      { key: 'accountId', label: 'Account', type: 'lookup', module: 'accounts' },
      { key: 'title', label: 'Designation', type: 'text' },
      { key: 'email', label: 'Email', type: 'email' },
      { key: 'phone', label: 'Phone', type: 'phone' },
      { key: 'source', label: 'Lead Source', type: 'select', options: SOURCES },
      { key: 'city', label: 'City', type: 'text' },
      { key: 'birthday', label: 'Date of Birth', type: 'date' },
      owner,
      { key: 'notesText', label: 'Description', type: 'textarea' },
    ],
    sections: [['Contact Information', ['name', 'accountId', 'title', 'email', 'phone', 'source', 'city', 'birthday', 'ownerId']], ['Description', ['notesText']]],
    columns: ['name', 'accountId', 'email', 'phone', 'city', 'ownerId'],
    kanban: ['source'], calendar: 'birthday', chart: ['source', 'accountId', 'city'],
    views: [{ id: 'mine', name: 'My Contacts', filters: [{ field: 'ownerId', op: 'is', value: ['$me'] }] }],
  },
  accounts: {
    label: 'Accounts', singular: 'Account', icon: 'bank', title: 'name', subtitle: 'type',
    fields: [
      { key: 'name', label: 'Account Name', type: 'text', required: true },
      { key: 'type', label: 'Account Type', type: 'select', options: ['Contractor', 'Builder', 'Dealer', 'Government', 'Industrial', 'Retail customer', 'Supplier'] },
      { key: 'industry', label: 'Industry', type: 'select', options: INDUSTRIES },
      { key: 'phone', label: 'Phone', type: 'phone' },
      { key: 'email', label: 'Email', type: 'email' },
      { key: 'website', label: 'Website', type: 'url' },
      { key: 'gstin', label: 'GSTIN', type: 'text' },
      { key: 'city', label: 'City', type: 'text' },
      { key: 'annualVolume', label: 'Annual Steel Volume (MT)', type: 'number' },
      { key: 'rating', label: 'Rating', type: 'select', options: ['Key account', 'Regular', 'Occasional'] },
      owner,
      { key: 'address', label: 'Address', type: 'textarea' },
    ],
    sections: [['Account Information', ['name', 'type', 'industry', 'phone', 'email', 'website', 'gstin', 'city', 'annualVolume', 'rating', 'ownerId']], ['Address', ['address']]],
    columns: ['name', 'type', 'phone', 'city', 'rating', 'ownerId'],
    kanban: ['type', 'rating', 'industry'], chart: ['type', 'industry', 'rating', 'city'],
    views: [{ id: 'mine', name: 'My Accounts', filters: [{ field: 'ownerId', op: 'is', value: ['$me'] }] }, { id: 'key', name: 'Key Accounts', filters: [{ field: 'rating', op: 'is', value: ['Key account'] }] }],
  },
  deals: {
    label: 'Deals', singular: 'Deal', icon: 'briefcase', title: 'name', subtitle: 'stage',
    fields: [
      { key: 'name', label: 'Deal Name', type: 'text', required: true },
      { key: 'accountId', label: 'Account', type: 'lookup', module: 'accounts' },
      { key: 'contactId', label: 'Contact', type: 'lookup', module: 'contacts' },
      { key: 'amount', label: 'Amount', type: 'currency' },
      { key: 'stage', label: 'Stage', type: 'select', options: DEAL_STAGES.map(([s]) => s) },
      { key: 'probability', label: 'Probability (%)', type: 'percent' },
      { key: 'closingDate', label: 'Closing Date', type: 'date' },
      { key: 'type', label: 'Type', type: 'select', options: ['New Business', 'Existing Business'] },
      { key: 'source', label: 'Lead Source', type: 'select', options: SOURCES },
      { key: 'tonnage', label: 'Tonnage (MT)', type: 'number' },
      { key: 'campaignId', label: 'Campaign', type: 'lookup', module: 'campaigns' },
      owner,
      { key: 'description', label: 'Description', type: 'textarea' },
    ],
    sections: [['Deal Information', ['name', 'accountId', 'contactId', 'amount', 'stage', 'probability', 'closingDate', 'type', 'source', 'tonnage', 'campaignId', 'ownerId']], ['Description', ['description']]],
    columns: ['name', 'accountId', 'amount', 'stage', 'closingDate', 'ownerId'],
    kanban: ['stage', 'type', 'source'], calendar: 'closingDate', chart: ['stage', 'source', 'type', 'accountId'], sum: 'amount',
    views: [
      { id: 'mine', name: 'My Deals', filters: [{ field: 'ownerId', op: 'is', value: ['$me'] }] },
      { id: 'open', name: 'Open Deals', filters: [{ field: 'stage', op: 'isnt', value: ['Closed Won', 'Closed Lost'] }] },
      { id: 'month', name: 'Closing This Month', filters: [{ field: 'closingDate', op: 'thisMonth', value: '' }] },
      { id: 'won', name: 'Won Deals', filters: [{ field: 'stage', op: 'is', value: ['Closed Won'] }] },
    ],
    defaultView: 'kanban',
  },
  tasks: {
    label: 'Tasks', singular: 'Task', icon: 'check', title: 'subject', subtitle: 'status', activity: true,
    fields: [
      { key: 'subject', label: 'Subject', type: 'text', required: true },
      { key: 'dueDate', label: 'Due Date', type: 'date' },
      { key: 'status', label: 'Status', type: 'select', options: ['Not Started', 'In Progress', 'Waiting', 'Completed', 'Deferred'] },
      { key: 'priority', label: 'Priority', type: 'select', options: ['High', 'Normal', 'Low'] },
      related, owner,
      { key: 'description', label: 'Description', type: 'textarea' },
    ],
    sections: [['Task Information', ['subject', 'dueDate', 'status', 'priority', 'relatedTo', 'ownerId']], ['Description', ['description']]],
    columns: ['subject', 'dueDate', 'status', 'priority', 'relatedTo', 'ownerId'],
    kanban: ['status', 'priority'], calendar: 'dueDate', chart: ['status', 'priority', 'ownerId'],
    views: [
      { id: 'mine', name: 'My Open Tasks', filters: [{ field: 'ownerId', op: 'is', value: ['$me'] }, { field: 'status', op: 'isnt', value: ['Completed'] }] },
      { id: 'overdue', name: 'Overdue Tasks', filters: [{ field: 'dueDate', op: 'overdue', value: '' }, { field: 'status', op: 'isnt', value: ['Completed'] }] },
      { id: 'today', name: "Today's Tasks", filters: [{ field: 'dueDate', op: 'today', value: '' }] },
    ],
    done: (r) => r.status === 'Completed', dateField: 'dueDate',
  },
  meetings: {
    label: 'Meetings', singular: 'Meeting', icon: 'clock', title: 'title', subtitle: 'location', activity: true,
    fields: [
      { key: 'title', label: 'Title', type: 'text', required: true },
      { key: 'from', label: 'From', type: 'datetime', required: true },
      { key: 'to', label: 'To', type: 'datetime' },
      { key: 'location', label: 'Location', type: 'text' },
      { key: 'status', label: 'Status', type: 'select', options: ['Planned', 'Held', 'Cancelled'] },
      related,
      { key: 'participants', label: 'Participants', type: 'text' },
      owner,
      { key: 'agenda', label: 'Agenda / minutes', type: 'textarea' },
    ],
    sections: [['Meeting Information', ['title', 'from', 'to', 'location', 'status', 'relatedTo', 'participants', 'ownerId']], ['Agenda', ['agenda']]],
    columns: ['title', 'from', 'location', 'status', 'relatedTo', 'ownerId'],
    kanban: ['status'], calendar: 'from', chart: ['status', 'ownerId'],
    views: [{ id: 'upcoming', name: 'Upcoming Meetings', filters: [{ field: 'from', op: 'next7', value: '' }] }, { id: 'mine', name: 'My Meetings', filters: [{ field: 'ownerId', op: 'is', value: ['$me'] }] }],
    done: (r) => r.status !== 'Planned', dateField: 'from',
  },
  calls: {
    label: 'Calls', singular: 'Call', icon: 'phone', title: 'subject', subtitle: 'callType', activity: true,
    fields: [
      { key: 'subject', label: 'Subject', type: 'text', required: true },
      { key: 'callType', label: 'Call Type', type: 'select', options: ['Outbound', 'Inbound', 'Missed'] },
      { key: 'callTime', label: 'Call Time', type: 'datetime' },
      { key: 'duration', label: 'Duration (minutes)', type: 'number' },
      { key: 'status', label: 'Call Status', type: 'select', options: ['Scheduled', 'Completed', 'No answer'] },
      { key: 'result', label: 'Call Result', type: 'select', options: ['Interested', 'Not interested', 'Call back later', 'Quotation requested', 'Order confirmed'] },
      related, owner,
      { key: 'summary', label: 'Summary', type: 'textarea' },
    ],
    sections: [['Call Information', ['subject', 'callType', 'callTime', 'duration', 'status', 'result', 'relatedTo', 'ownerId']], ['Summary', ['summary']]],
    columns: ['subject', 'callType', 'callTime', 'status', 'result', 'relatedTo', 'ownerId'],
    kanban: ['status', 'result', 'callType'], calendar: 'callTime', chart: ['result', 'callType', 'status', 'ownerId'],
    views: [{ id: 'scheduled', name: 'Scheduled Calls', filters: [{ field: 'status', op: 'is', value: ['Scheduled'] }] }, { id: 'mine', name: 'My Calls', filters: [{ field: 'ownerId', op: 'is', value: ['$me'] }] }],
    done: (r) => r.status !== 'Scheduled', dateField: 'callTime',
  },
  campaigns: {
    label: 'Campaigns', singular: 'Campaign', icon: 'gift', title: 'name', subtitle: 'type',
    fields: [
      { key: 'name', label: 'Campaign Name', type: 'text', required: true },
      { key: 'type', label: 'Type', type: 'select', options: ['WhatsApp', 'Email', 'SMS', 'Trade show', 'Advertisement', 'Field visit', 'Referral programme'] },
      { key: 'status', label: 'Status', type: 'select', options: ['Planning', 'Active', 'Completed', 'Cancelled'] },
      { key: 'startDate', label: 'Start Date', type: 'date' },
      { key: 'endDate', label: 'End Date', type: 'date' },
      { key: 'budget', label: 'Budgeted Cost', type: 'currency' },
      { key: 'expectedRevenue', label: 'Expected Revenue', type: 'currency' },
      owner,
      { key: 'description', label: 'Description', type: 'textarea' },
    ],
    sections: [['Campaign Information', ['name', 'type', 'status', 'startDate', 'endDate', 'budget', 'expectedRevenue', 'ownerId']], ['Description', ['description']]],
    columns: ['name', 'type', 'status', 'startDate', 'endDate', 'budget', 'ownerId'],
    kanban: ['status', 'type'], calendar: 'startDate', chart: ['type', 'status'], sum: 'budget',
    views: [{ id: 'active', name: 'Active Campaigns', filters: [{ field: 'status', op: 'is', value: ['Active'] }] }],
  },
};
export const CRM_KEYS = Object.keys(CRM_MODULES);
export const ACTIVITY_KEYS = ['tasks', 'meetings', 'calls'];
export const fieldOf = (mod, key) => CRM_MODULES[mod].fields.find((f) => f.key === key);

// ---------- dates ----------
const pad = (n) => String(n).padStart(2, '0');
export const localDate = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const shiftDate = (n, from = new Date()) => { const d = new Date(from); d.setDate(d.getDate() + n); return localDate(d); };
const weekStart = () => { const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return localDate(d); };

// ---------- display ----------
export function recordTitle(db, mod, id) {
  const r = db.crm[mod]?.find((x) => x.id === id);
  return r ? r[CRM_MODULES[mod].title] : '';
}

export function display(db, field, value) {
  if (value == null || value === '') return '';
  switch (field.type) {
    case 'currency': return '₹' + Number(value).toLocaleString('en-IN', { maximumFractionDigits: 0 });
    case 'percent': return `${value}%`;
    case 'number': return Number(value).toLocaleString('en-IN');
    case 'owner': return db.users.find((u) => u.id === value)?.name || '';
    case 'lookup': return recordTitle(db, field.module, value);
    case 'related': return value?.id ? `${recordTitle(db, value.module, value.id)} (${CRM_MODULES[value.module].singular})` : '';
    case 'date': return new Date(value + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    case 'datetime': return new Date(value).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
    case 'boolean': return value ? 'Yes' : 'No';
    default: return String(value);
  }
}

// Raw value used for sorting and grouping.
export function sortValue(db, field, value) {
  if (['currency', 'number', 'percent'].includes(field.type)) return Number(value) || 0;
  if (['owner', 'lookup', 'related'].includes(field.type)) return display(db, field, value).toLowerCase();
  return String(value ?? '').toLowerCase();
}

// ---------- filters ----------
export const OPERATORS = {
  text: [['contains', 'contains'], ['notContains', "doesn't contain"], ['eq', 'is'], ['neq', "isn't"], ['starts', 'starts with'], ['empty', 'is empty'], ['notEmpty', 'is not empty']],
  select: [['is', 'is'], ['isnt', "isn't"], ['empty', 'is empty'], ['notEmpty', 'is not empty']],
  number: [['eq', '='], ['neq', '≠'], ['lt', '<'], ['lte', '≤'], ['gt', '>'], ['gte', '≥'], ['between', 'between'], ['empty', 'is empty']],
  date: [['today', 'Today'], ['tomorrow', 'Tomorrow'], ['yesterday', 'Yesterday'], ['thisWeek', 'This week'], ['thisMonth', 'This month'], ['last7', 'Last 7 days'], ['next7', 'Next 7 days'], ['next30', 'Next 30 days'], ['overdue', 'Overdue (before today)'], ['dueBy', 'Due today or earlier'], ['before', 'Before'], ['after', 'After'], ['between', 'Between'], ['empty', 'is empty']],
};
export const opsFor = (field) => OPERATORS[{ email: 'text', phone: 'text', url: 'text', textarea: 'text', owner: 'select', lookup: 'select', related: 'text', currency: 'number', percent: 'number', datetime: 'date', boolean: 'select' }[field.type] || field.type] || OPERATORS.text;
export const needsValue = (op) => !['empty', 'notEmpty', 'today', 'tomorrow', 'yesterday', 'thisWeek', 'thisMonth', 'last7', 'next7', 'next30', 'overdue', 'dueBy'].includes(op);

export function matches(db, mod, rec, cond, me) {
  const field = fieldOf(mod, cond.field);
  if (!field) return true;
  let v = rec[cond.field];
  const empty = v == null || v === '' || (field.type === 'related' && !v?.id);
  if (cond.op === 'empty') return empty;
  if (cond.op === 'notEmpty') return !empty;
  if (['select', 'owner', 'lookup', 'boolean'].includes(field.type)) {
    const set = (Array.isArray(cond.value) ? cond.value : [cond.value]).map((x) => (x === '$me' ? me : x));
    const hit = set.includes(field.type === 'boolean' ? String(!!v) : v);
    return cond.op === 'isnt' ? !hit : hit;
  }
  if (['currency', 'number', 'percent'].includes(field.type)) {
    if (empty) return false;
    const n = Number(v), a = Number(cond.value), b = Number(cond.value2);
    return { eq: n === a, neq: n !== a, lt: n < a, lte: n <= a, gt: n > a, gte: n >= a, between: n >= a && n <= b }[cond.op] ?? true;
  }
  if (['date', 'datetime'].includes(field.type)) {
    if (empty) return false;
    const d = String(v).slice(0, 10), t = localDate();
    return {
      today: d === t, tomorrow: d === shiftDate(1), yesterday: d === shiftDate(-1), thisWeek: d >= weekStart() && d <= shiftDate(6, new Date(weekStart() + 'T00:00:00')),
      thisMonth: d.slice(0, 7) === t.slice(0, 7), last7: d >= shiftDate(-7) && d <= t, next7: d >= t && d <= shiftDate(7), next30: d >= t && d <= shiftDate(30),
      overdue: d < t, dueBy: d <= t, before: d < cond.value, after: d > cond.value, between: d >= cond.value && d <= cond.value2,
    }[cond.op] ?? true;
  }
  v = (field.type === 'related' ? display(db, field, v) : String(v ?? '')).toLowerCase();
  const q = String(cond.value ?? '').toLowerCase();
  return { contains: v.includes(q), notContains: !v.includes(q), eq: v === q, neq: v !== q, starts: v.startsWith(q) }[cond.op] ?? true;
}

// Records' activities and notes, used by the system-defined filters and the detail page.
export const activitiesOf = (db, mod, id) => ACTIVITY_KEYS.flatMap((k) => db.crm[k].filter((a) => a.relatedTo?.module === mod && a.relatedTo?.id === id).map((a) => ({ ...a, _mod: k })));
const isOpen = (a) => !CRM_MODULES[a._mod].done(a);
const actDate = (a) => String(a[CRM_MODULES[a._mod].dateField] || '').slice(0, 10);

export const SYSTEM_FILTERS = [
  ['touched', 'Touched records', (db, mod, r) => !!r.touched],
  ['untouched', 'Untouched records', (db, mod, r) => !r.touched],
  ['createdToday', 'Created today', (db, mod, r) => r.createdAt?.slice(0, 10) === localDate()],
  ['createdWeek', 'Created in last 7 days', (db, mod, r) => daysBetween(r.createdAt) <= 7],
  ['modifiedWeek', 'Modified in last 7 days', (db, mod, r) => daysBetween(r.modifiedAt || r.createdAt) <= 7],
  ['openActivities', 'With open activities', (db, mod, r) => activitiesOf(db, mod, r.id).some(isOpen)],
  ['noActivities', 'Without open activities', (db, mod, r) => !activitiesOf(db, mod, r.id).some(isOpen)],
  ['overdueActivities', 'With overdue activities', (db, mod, r) => activitiesOf(db, mod, r.id).some((a) => isOpen(a) && actDate(a) && actDate(a) < localDate())],
  ['withNotes', 'With notes', (db, mod, r) => db.crm.notes.some((n) => n.module === mod && n.recordId === r.id)],
  ['notConverted', 'Not converted', (db, mod, r) => !r.converted, 'leads'],
  ['converted', 'Converted', (db, mod, r) => !!r.converted, 'leads'],
];
export const systemFiltersFor = (mod) => SYSTEM_FILTERS.filter((f) => !f[3] || f[3] === mod);

export function applyView(db, mod, records, { filters = [], sys = [], search = '', quick = 'all' }, me) {
  const m = CRM_MODULES[mod];
  const q = search.trim().toLowerCase();
  return records.filter((r) => {
    if (quick === 'mine' && r.ownerId !== me) return false;
    if (quick === 'touched' && !r.touched) return false;
    if (quick === 'untouched' && r.touched) return false;
    for (const s of sys) { const f = SYSTEM_FILTERS.find(([k]) => k === s); if (f && !f[2](db, mod, r)) return false; }
    for (const c of filters) if (!matches(db, mod, r, c, me)) return false;
    if (q && !m.fields.some((f) => display(db, f, r[f.key]).toLowerCase().includes(q))) return false;
    return true;
  });
}

export function sortRecords(db, mod, records, sort) {
  if (!sort?.field) return records;
  const f = fieldOf(mod, sort.field) || { type: 'text' };
  const dir = sort.dir === 'desc' ? -1 : 1;
  return records.slice().sort((a, b) => {
    const x = sort.field === 'createdAt' || sort.field === 'modifiedAt' ? a[sort.field] || '' : sortValue(db, f, a[sort.field]);
    const y = sort.field === 'createdAt' || sort.field === 'modifiedAt' ? b[sort.field] || '' : sortValue(db, f, b[sort.field]);
    return (x > y ? 1 : x < y ? -1 : 0) * dir;
  });
}

export function groupTotals(records, field) {
  return round2(records.reduce((s, r) => s + (Number(r[field]) || 0), 0));
}

// Names of changed fields for the timeline, e.g. "Stage: Qualification → Negotiation".
export function describeChanges(db, mod, before, after) {
  return CRM_MODULES[mod].fields.filter((f) => JSON.stringify(before[f.key] ?? '') !== JSON.stringify(after[f.key] ?? ''))
    .map((f) => `${f.label}: ${display(db, f, before[f.key]) || '—'} → ${display(db, f, after[f.key]) || '—'}`);
}
