// Preview mode only (built with VITE_PREVIEW=1): an in-memory stand-in for backend/api.php
// with sample data, so the screens can be clicked through without a server. Nothing persists.

const DAY = 86400000;
const iso = (ms) => new Date(ms).toISOString();
const dateStr = (ms) => new Date(ms).toISOString().slice(0, 10);
const now = Date.now();

let seed = 7;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const pick = (a) => a[Math.floor(rnd() * a.length)];

const users = [
  { id: 1, username: 'admin', fullName: 'Aniket (Admin)', role: 'admin', state: null, status: 'active' },
  ...[
    ['Ravi Das', 'ravi', 'Assam'], ['Priya Nair', 'priya', 'Kerala'], ['Imran Khan', 'imran', 'Uttar Pradesh'],
    ['Sneha Patil', 'sneha', 'Maharashtra'], ['Gurpreet Singh', 'gurpreet', 'Punjab'], ['Lakshmi Iyer', 'lakshmi', 'Tamil Nadu'],
    ['Amit Shah', 'amit', 'Gujarat'], ['Rohit Sen', 'rohit', 'West Bengal'],
  ].map(([fullName, username, state], i) => ({
    id: i + 2, username, fullName, role: 'employee', state, status: 'active', awaitingPin: false,
    createdAt: iso(now - 60 * DAY), lastLoginAt: iso(now - (i * 7 + 1) * 3600000), lastActiveAt: iso(now - (i * 5 + 2) * 3600000),
  })),
];
users[8].lastActiveAt = iso(now - 9 * DAY); users[8].lastLoginAt = iso(now - 9 * DAY); // one quiet employee

const businesses = ['Sharma Traders', 'Green Valley School', 'City Hospital', 'Royal Jewellers', 'Metro Pharmacy', 'Sunrise Hotel', 'Bharat Motors', 'Kisan Agro', 'Style Studio', 'Om Logistics', 'Fresh Mart', 'Dream Homes Realty', 'Tech Coaching Centre', 'Annapurna Foods', 'Blue Star Electricals'];
const products = { software: ['Billing software', 'School ERP', 'Inventory software'], app: ['Delivery app', 'Booking app', 'Customer app'], website: ['Business website', 'E-commerce site', 'Portfolio site'] };
const stages = ['new', 'contacted', 'demo', 'negotiation', 'won', 'lost'];

const leads = [];
const activities = [];
let actId = 0, leadId = 0, nameCounter = 0;
const addAct = (userId, lead, type, note, ts) => activities.push({ id: ++actId, userId, leadId: lead ? lead.id : null, leadName: lead ? lead.name : null, type, note, createdAt: iso(ts) });

users.filter((u) => u.role === 'employee').forEach((u) => {
  const n = 4 + Math.floor(rnd() * 4);
  for (let i = 0; i < n; i++) {
    const productType = pick(['software', 'app', 'website']);
    const stage = pick(['new', 'contacted', 'contacted', 'demo', 'negotiation', 'won', 'won', 'lost']);
    const created = now - Math.floor(rnd() * 40) * DAY - Math.floor(rnd() * DAY);
    const est = Math.round((15 + rnd() * 185) / 5) * 1000;
    const lead = {
      id: ++leadId, userId: u.id, employee: u.fullName, name: businesses[nameCounter % businesses.length] + (nameCounter >= businesses.length ? ' ' + (Math.floor(nameCounter / businesses.length) + 1) : ''), contactPerson: pick(['Mr. Verma', 'Ms. Joshi', 'Mr. Reddy', 'Ms. Bose']),
      phone: '9' + String(Math.floor(100000000 + rnd() * 899999999)), email: null, state: u.state, city: pick(['Tezpur', 'Guwahati', 'Kochi', 'Lucknow', 'Pune', 'Ludhiana', 'Chennai', 'Surat', 'Kolkata']),
      productType, productName: pick(products[productType]), stage, estValue: est, dealValue: null,
      nextFollowup: ['won', 'lost'].includes(stage) ? null : dateStr(now + Math.floor(rnd() * 9 - 3) * DAY), notes: 'Interested; asked for a quote.',
      createdAt: iso(created), updatedAt: iso(created + 2 * DAY), wonAt: null,
    };
    if (stage === 'won') { lead.dealValue = Math.round(est * (0.85 + rnd() * 0.2) / 500) * 500; lead.wonAt = iso(Math.min(now - 3600000, created + (3 + rnd() * 10) * DAY)); }
    nameCounter++;
    leads.push(lead);
    addAct(u.id, lead, 'lead_added', `New ${productType} lead in ${u.state}`, created);
    if (stage !== 'new') addAct(u.id, lead, pick(['call', 'visit', 'meeting']), pick(['Discussed requirements', 'Showed a demo', 'Shared the price quote']), created + DAY);
    if (stage === 'won') addAct(u.id, lead, 'client_won', 'Deal value ₹' + lead.dealValue.toLocaleString('en-IN'), Date.parse(lead.wonAt));
  }
});
activities.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)).forEach((a, i) => { a.id = i + 1; });
actId = activities.length;

const demos = [];
let demoId = 0;
const addDemo = (u, l, status, extra = {}) => demos.push({ id: ++demoId, userId: u.id, employee: u.fullName, employeeState: u.state, leadId: l ? l.id : null,
  clientName: l ? l.name : extra.clientName, contactPerson: l ? l.contactPerson : null, phone: l ? l.phone : null, state: l ? l.state : u.state, city: l ? l.city : null,
  productType: l ? l.productType : 'software', productName: l ? l.productName : null, mode: 'online', preferredDate: dateStr(now + 3 * DAY), preferredTime: 'Morning',
  notes: 'Client wants to see how billing and GST reports work.', status, scheduledAt: null, adminNote: null, createdAt: iso(now - 3600000 * (demoId + 2)), updatedAt: iso(now), ...extra });
addDemo(users[2], leads.find((l) => l.userId === 3 && l.stage !== 'won'), 'pending');
addDemo(users[4], leads.find((l) => l.userId === 5 && l.stage !== 'won'), 'pending', { mode: 'onsite' });
addDemo(users[1], leads.find((l) => l.userId === 2), 'scheduled', { scheduledAt: dateStr(now + 2 * DAY) + 'T15:30', adminNote: 'Demo on Google Meet — link will be sent. Rahul will attend.' });
addDemo(users[6], null, 'completed', { clientName: 'Sunrise Dental Clinic', scheduledAt: dateStr(now - 4 * DAY) + 'T11:00' });
addDemo(users[3], null, 'declined', { clientName: 'Local Kirana Store', adminNote: 'Budget too low for a live demo — share the brochure instead.' });

const tokens = new Map();
const err = (m, status = 400) => Object.assign(new Error(m), { status });
const userOf = (token) => { const u = tokens.get(token); if (!u) throw err('Session expired. Please log in again.', 401); return u; };
const inRange = (ts, p) => (!p.from || ts >= p.from + 'T00:00:00') && (!p.to || ts.slice(0, 10) <= p.to);
const scopeUser = (me, p) => (me.role === 'admin' ? (p.userId ? Number(p.userId) : null) : me.id);
const pub = (u) => ({ id: u.id, username: u.username, fullName: u.fullName, role: u.role, state: u.state });
const nameOf = (id) => users.find((u) => u.id === id)?.fullName;

const handlers = {
  setupStatus: () => ({ adminExists: true }),
  login: (p) => {
    const u = users.find((x) => x.username === String(p.username).toLowerCase() && x.status === 'active');
    if (!u) throw err('Invalid username or PIN.', 401);
    const t = 'preview-' + u.id; tokens.set(t, u); return { token: t, user: pub(u) };
  },
  logout: () => ({ ok: true }),
  me: (p, me) => ({ user: pub(me) }),

  listTeam: (p, me) => { if (me.role !== 'admin') throw err('Admin only.', 403); return { team: users.filter((u) => u.role === 'employee') }; },
  createEmployee: (p) => {
    const username = String(p.username).toLowerCase();
    if (users.some((u) => u.username === username)) throw err('That username is already taken.');
    users.push({ id: users.length + 1, username, fullName: p.fullName, role: 'employee', state: p.state, status: 'active', awaitingPin: true, createdAt: iso(Date.now()), lastLoginAt: null, lastActiveAt: null });
    return { username, setupCode: 'PREV1EW9' };
  },
  updateEmployee: (p) => { const u = users.find((x) => x.id === p.userId); Object.assign(u, { fullName: p.fullName, state: p.state }); return { ok: true }; },
  resetEmployeePin: (p) => { users.find((x) => x.id === p.userId).awaitingPin = true; return { setupCode: 'PREV1EW9' }; },
  removeEmployee: (p) => { users.find((x) => x.id === p.userId).status = 'removed'; return { ok: true }; },

  listLeads: (p, me) => {
    const uid = scopeUser(me, p);
    const q = (p.q || '').toLowerCase();
    const today = dateStr(Date.now());
    const rows = leads.filter((l) => (uid === null || l.userId === uid) && (!p.stage || l.stage === p.stage) && (!p.productType || l.productType === p.productType)
      && (!q || [l.name, l.contactPerson, l.phone, l.city].some((v) => (v || '').toLowerCase().includes(q)))
      && (!p.dueOnly || (l.nextFollowup && l.nextFollowup <= today && !['won', 'lost'].includes(l.stage))))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return { total: rows.length, leads: rows };
  },
  addLead: (p, me) => {
    const l = { id: ++leadId, userId: me.id, employee: me.fullName, name: p.name, contactPerson: p.contactPerson || null, phone: p.phone || null, email: p.email || null, state: p.state, city: p.city || null,
      productType: p.productType, productName: p.productName || null, stage: 'new', estValue: Number(p.estValue) || 0, dealValue: null, nextFollowup: p.nextFollowup || null, notes: p.notes || null,
      createdAt: iso(Date.now()), updatedAt: iso(Date.now()), wonAt: null };
    leads.push(l); addAct(me.id, l, 'lead_added', `New ${l.productType} lead in ${l.state}`, Date.now()); return { id: l.id };
  },
  updateLead: (p, me) => {
    const l = leads.find((x) => x.id === p.id && x.userId === me.id); if (!l) throw err('Lead not found.', 404);
    const old = l.stage; const stage = p.stage || old;
    Object.assign(l, { name: p.name, contactPerson: p.contactPerson || null, phone: p.phone || null, email: p.email || null, state: p.state, city: p.city || null, productType: p.productType,
      productName: p.productName || null, estValue: Number(p.estValue) || 0, nextFollowup: p.nextFollowup || null, notes: p.notes || null, stage, updatedAt: iso(Date.now()) });
    if (stage === 'won') { l.dealValue = p.dealValue !== '' && p.dealValue != null ? Number(p.dealValue) : (l.dealValue ?? l.estValue); if (old !== 'won') l.wonAt = iso(Date.now()); } else { l.dealValue = null; l.wonAt = null; }
    if (stage !== old) { addAct(me.id, l, 'stage_change', `${old} → ${stage}`, Date.now()); if (stage === 'won') addAct(me.id, l, 'client_won', 'Deal value ₹' + l.dealValue.toLocaleString('en-IN'), Date.now()); }
    return { ok: true };
  },
  deleteLead: (p, me) => { const i = leads.findIndex((x) => x.id === p.id && (me.role === 'admin' || x.userId === me.id)); if (i < 0) throw err('Lead not found.', 404); leads.splice(i, 1); return { ok: true }; },

  listActivities: (p, me) => {
    const uid = scopeUser(me, p);
    const limit = p.limit || 50;
    const rows = activities.filter((a) => (uid === null || a.userId === uid) && (!p.leadId || a.leadId === p.leadId) && (!p.type || a.type === p.type) && inRange(a.createdAt, p) && (!p.beforeId || a.id < p.beforeId))
      .sort((a, b) => b.id - a.id);
    return { hasMore: rows.length > limit, activities: rows.slice(0, limit).map((a) => ({ ...a, employee: nameOf(a.userId), state: users.find((u) => u.id === a.userId)?.state })) };
  },
  addActivity: (p, me) => {
    const l = p.leadId ? leads.find((x) => x.id === p.leadId) : null;
    addAct(me.id, l, p.type, p.note, Date.now()); return { ok: true };
  },

  exportAll: (p, me) => {
    if (me.role !== 'admin') throw err('Admin only.', 403);
    return { exportedAt: iso(Date.now()), demoRequests: demos, leads, employees: users.filter((u) => u.role === 'employee'),
      activities: activities.map((a) => ({ ...a, employee: nameOf(a.userId), state: users.find((u) => u.id === a.userId)?.state })) };
  },

  listDemoRequests: (p, me) => {
    const mine = demos.filter((d) => me.role === 'admin' || d.userId === me.id);
    return { pending: mine.filter((d) => d.status === 'pending').length,
      requests: mine.filter((d) => (!p.status || d.status === p.status) && (!p.userId || d.userId === Number(p.userId)))
        .sort((a, b) => (b.status === 'pending') - (a.status === 'pending') || b.createdAt.localeCompare(a.createdAt)) };
  },
  addDemoRequest: (p, me) => {
    const l = p.leadId ? leads.find((x) => x.id === Number(p.leadId)) : null;
    if (!p.clientName && !l) throw err('clientName is required.');
    demos.push({ id: ++demoId, userId: me.id, employee: me.fullName, employeeState: me.state, leadId: l ? l.id : null, clientName: p.clientName || l.name,
      contactPerson: p.contactPerson || null, phone: p.phone || null, state: p.state, city: p.city || null, productType: p.productType, productName: p.productName || null,
      mode: p.mode, preferredDate: p.preferredDate || null, preferredTime: p.preferredTime || null, notes: p.notes || null, status: 'pending', scheduledAt: null, adminNote: null,
      createdAt: iso(Date.now()), updatedAt: iso(Date.now()) });
    addAct(me.id, l, 'demo_requested', `Requested a demo (${p.mode}, ${p.productType})`, Date.now()); return { id: demoId };
  },
  updateDemoRequest: (p, me) => {
    if (me.role !== 'admin') throw err('Admin only.', 403);
    const d = demos.find((x) => x.id === p.id); if (!d) throw err('Demo request not found.', 404);
    if (p.status === 'scheduled' && !p.scheduledAt) throw err('Pick the date and time of the demo.');
    Object.assign(d, { status: p.status, scheduledAt: ['scheduled', 'completed'].includes(p.status) ? (p.scheduledAt || d.scheduledAt) : null, adminNote: p.adminNote || null, updatedAt: iso(Date.now()) });
    return { ok: true };
  },
  cancelDemoRequest: (p, me) => {
    const d = demos.find((x) => x.id === p.id && x.userId === me.id); if (!d) throw err('Demo request not found.', 404);
    if (d.status !== 'pending') throw err('Only a pending request can be cancelled -- ask the DTA team.');
    d.status = 'cancelled'; return { ok: true };
  },

  stats: (p, me) => {
    const emps = users.filter((u) => u.role === 'employee' && (me.role === 'admin' || u.id === me.id)).map((u) => {
      const mine = leads.filter((l) => l.userId === u.id);
      const won = mine.filter((l) => l.stage === 'won' && inRange(l.wonAt, p));
      return { id: u.id, fullName: u.fullName, username: u.username, state: u.state, status: u.status, lastLoginAt: u.lastLoginAt, lastActiveAt: u.lastActiveAt,
        leads: mine.filter((l) => inRange(l.createdAt, p)).length, clients: won.length, revenue: won.reduce((s, l) => s + l.dealValue, 0),
        activities: activities.filter((a) => a.userId === u.id && ['call', 'visit', 'meeting', 'follow_up', 'note'].includes(a.type) && inRange(a.createdAt, p)).length };
    });
    const ids = new Set(emps.map((e) => e.id));
    const scoped = leads.filter((l) => ids.has(l.userId));
    const byProduct = ['software', 'app', 'website'].map((t) => {
      const won = scoped.filter((l) => l.productType === t && l.stage === 'won' && inRange(l.wonAt, p));
      return { productType: t, leads: scoped.filter((l) => l.productType === t && inRange(l.createdAt, p)).length, clients: won.length, revenue: won.reduce((s, l) => s + l.dealValue, 0) };
    });
    const pipeline = Object.fromEntries(stages.map((s) => [s, scoped.filter((l) => l.stage === s).length]));
    const today = dateStr(Date.now());
    const byState = {};
    emps.forEach((e) => { const s = e.state || 'Unassigned'; const r = (byState[s] ??= { state: s, employees: 0, leads: 0, clients: 0, revenue: 0 }); r.employees++; r.leads += e.leads; r.clients += e.clients; r.revenue += e.revenue; });
    const sum = (k) => emps.reduce((s, e) => s + e[k], 0);
    return { totals: { leads: sum('leads'), clients: sum('clients'), revenue: sum('revenue'), activities: sum('activities'), employees: emps.filter((e) => e.status === 'active').length },
      employees: emps, byState: Object.values(byState), byProduct, pipeline,
      followupsDue: scoped.filter((l) => l.nextFollowup && l.nextFollowup <= today && !['won', 'lost'].includes(l.stage)).length };
  },
};

export async function mockCall(token, action, payload = {}) {
  await new Promise((r) => setTimeout(r, 120));
  const h = handlers[action];
  if (!h) throw err('Unknown action.', 404);
  const open = ['setupStatus', 'login', 'logout'];
  return h(payload, open.includes(action) ? null : userOf(token));
}
