// Fictional CRM demo data for a Tezpur steel trader.
import { addDays } from './format.js';
import { shiftDate } from './crmMeta.js';

export function seedCrm(db) {
  const now = new Date().toISOString();
  const ago = (d) => addDays(now, -d);
  const base = (i, owner) => ({ createdAt: ago(40 - i * 2), modifiedAt: ago(Math.max(0, 20 - i)), createdBy: 'Sales Manager', ownerId: owner, touched: i % 3 !== 0 });
  const crm = { leads: [], contacts: [], accounts: [], deals: [], tasks: [], meetings: [], calls: [], campaigns: [], notes: [], timeline: [], views: {}, prefs: {} };

  crm.campaigns = [
    ['cp1', 'Monsoon TMT Offer 2026', 'WhatsApp', 'Active', -20, 25, 15000, 2500000],
    ['cp2', 'Builders Meet – Tezpur', 'Trade show', 'Completed', -45, -44, 60000, 4000000],
    ['cp3', 'Dealer Network Drive – Biswanath', 'Field visit', 'Planning', 10, 40, 30000, 3000000],
  ].map(([id, name, type, status, s, e, budget, expectedRevenue], i) => ({ id, name, type, status, startDate: shiftDate(s), endDate: shiftDate(e), budget, expectedRevenue, description: '', ...base(i, 'u2') }));

  const leads = [
    ['Rupam Baruah', 'Tezpur Medical College – Hostel Block', 'Executive Engineer', 'Govt. tender', 'Government', 'Qualified', 'Hot', 2600000, 2, 'Tezpur', 'cp2', 'TMT 12/16 mm, ~40 MT'],
    ['Sanjay Agarwal', 'Sonitpur Rice Mill', 'Proprietor', 'Walk-in', 'Industrial', 'Contacted', 'Warm', 850000, -1, 'Dhekiajuli', '', 'Structurals for shed, ~12 MT'],
    ['Pallavi Hazarika', 'Green Valley Apartments', 'Project Manager', 'Referral', 'Real estate', 'Not Contacted', 'Hot', 3400000, 0, 'Tezpur', 'cp1', 'TMT all sizes, phased over 8 months'],
    ['Er. Bhaskar Saikia', 'Biswanath PWD Division', 'Assistant Engineer', 'Field visit', 'Government', 'Attempted to Contact', 'Warm', 620000, -3, 'Biswanath Chariali', '', 'TMT 10/12 mm for culvert'],
    ['Nitul Bora', 'Dhekiajuli School Extension', 'Contractor', 'Phone', 'Construction', 'Contacted', 'Cold', 410000, 4, 'Dhekiajuli', '', 'TMT + binding wire'],
    ['Rakesh Jain', 'North Bank Warehousing', 'Director', 'Referral', 'Industrial', 'Qualified', 'Hot', 1250000, 1, 'Tezpur', 'cp2', 'ISMC channels + angles'],
    ['Dipankar Das', 'Rangapara Fuel Station', 'Owner', 'Walk-in', 'Retail', 'Lost Lead', 'Cold', 180000, null, 'Rangapara', '', 'Square pipes for canopy'],
    ['Monjit Gogoi', 'Gogoi Fabrication Works', 'Proprietor', 'WhatsApp', 'Fabrication', 'Not Contacted', 'Warm', 320000, 0, 'Tezpur', 'cp1', 'MS flats and angles monthly'],
    ['Farida Begum', 'Crescent Builders', 'Partner', 'Website', 'Construction', 'Attempted to Contact', 'Warm', 980000, 3, 'Jamugurihat', '', 'TMT for 3-storey commercial'],
    ['Prakash Kalita', 'Kalita & Sons Hardware', 'Owner', 'Advertisement', 'Retail', 'Junk Lead', 'Cold', 0, null, 'Gohpur', '', 'Asked for retail price list only'],
  ];
  crm.leads = leads.map(([name, company, title, source, industry, status, rating, value, fu, city, campaignId, requirement], i) => ({
    id: 'le' + (i + 1), name, company, title, email: `${name.split(' ').pop().toLowerCase()}@example.in`, phone: `98000003${String(i + 10)}`, status, rating, source, industry, value,
    followUp: fu == null ? '' : shiftDate(fu), city, campaignId, requirement, ...base(i, i % 2 ? 'u6' : 'u2'),
  }));

  crm.accounts = [
    ['ac1', 'Brahmaputra Builders', 'Builder', 'Construction', 'Mission Chariali, Tezpur', 'Key account', 450, '18AAAAA0001A1Z5'],
    ['ac2', 'Sonitpur Constructions', 'Contractor', 'Construction', 'Dekargaon, Tezpur', 'Regular', 220, '18AAAAA0002A1Z5'],
    ['ac3', 'Kamakhya Hardware', 'Dealer', 'Retail', 'Biswanath Chariali', 'Key account', 600, '18AAAAA0003A1Z5'],
    ['ac4', 'Arunachal Infra Projects', 'Contractor', 'Infrastructure', 'Bhalukpong', 'Regular', 300, '12AAAAA0006A1Z5'],
    ['ac5', 'North Bank Warehousing', 'Industrial', 'Industrial', 'Tezpur', 'Occasional', 80, ''],
  ].map(([id, name, type, industry, city, rating, annualVolume, gstin], i) => ({ id, name, type, industry, city, rating, annualVolume, gstin, phone: `98000004${i + 10}`, email: '', website: '', address: city, ...base(i, i % 2 ? 'u6' : 'u2') }));

  crm.contacts = [
    ['co1', 'Arup Choudhury', 'ac1', 'Purchase Head'], ['co2', 'Mridul Deka', 'ac1', 'Site Engineer'], ['co3', 'Hemanta Nath', 'ac2', 'Proprietor'],
    ['co4', 'Bijoy Kumar Shah', 'ac3', 'Owner'], ['co5', 'Tenzing Dorjee', 'ac4', 'Project Director'], ['co6', 'Rakesh Jain', 'ac5', 'Director'],
  ].map(([id, name, accountId, title], i) => ({ id, name, accountId, title, email: `${name.split(' ')[0].toLowerCase()}@example.in`, phone: `98000005${i + 10}`, source: 'Referral', city: crm.accounts.find((a) => a.id === accountId).city, birthday: shiftDate(i * 9 - 10).replace(/^\d{4}/, '1985'), notesText: '', ...base(i, i % 2 ? 'u6' : 'u2') }));

  crm.deals = [
    ['de1', 'Brahmaputra Builders – Riverside Towers', 'ac1', 'co1', 4200000, 'Negotiation', 12, 70],
    ['de2', 'Sonitpur Constructions – Bridge approach', 'ac2', 'co3', 1800000, 'Quotation Sent', 20, 30],
    ['de3', 'Kamakhya Hardware – Q3 dealer stock', 'ac3', 'co4', 2500000, 'Closed Won', -6, 42],
    ['de4', 'Arunachal Infra – Road project', 'ac4', 'co5', 5600000, 'Needs Analysis', 45, 95],
    ['de5', 'North Bank Warehousing – Shed 2', 'ac5', 'co6', 1250000, 'Qualification', 30, 18],
    ['de6', 'Brahmaputra Builders – Phase II', 'ac1', 'co2', 2100000, 'Quotation Sent', 5, 35],
    ['de7', 'Kamakhya Hardware – Gohpur branch', 'ac3', 'co4', 900000, 'Closed Lost', -15, 15],
  ].map(([id, name, accountId, contactId, amount, stage, close, tonnage], i) => ({
    id, name, accountId, contactId, amount, stage, probability: { Qualification: 10, 'Needs Analysis': 25, 'Quotation Sent': 50, Negotiation: 75, 'Closed Won': 100, 'Closed Lost': 0 }[stage],
    closingDate: shiftDate(close), type: i % 3 ? 'Existing Business' : 'New Business', source: 'Referral', tonnage, campaignId: i === 0 ? 'cp2' : '', description: '', ...base(i, i % 2 ? 'u6' : 'u2'),
  }));

  const rel = (module, id) => ({ module, id });
  crm.tasks = [
    ['Send revised quotation – Riverside Towers', 0, 'In Progress', 'High', rel('deals', 'de1')],
    ['Collect GST certificate', -2, 'Not Started', 'Normal', rel('accounts', 'ac4')],
    ['Follow up on tender documents', 1, 'Not Started', 'High', rel('leads', 'le1')],
    ['Share price list on WhatsApp', -1, 'Not Started', 'Normal', rel('leads', 'le8')],
    ['Confirm delivery schedule', 3, 'Waiting', 'Normal', rel('deals', 'de6')],
    ['Courier test certificates', -5, 'Completed', 'Low', rel('accounts', 'ac3')],
  ].map(([subject, d, status, priority, relatedTo], i) => ({ id: 'ta' + (i + 1), subject, dueDate: shiftDate(d), status, priority, relatedTo, description: '', ...base(i, i % 2 ? 'u6' : 'u2') }));
  const at = (d, h) => { const x = new Date(); x.setDate(x.getDate() + d); x.setHours(h, 0, 0, 0); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}T${String(h).padStart(2, '0')}:00`; };
  crm.meetings = [
    ['Site visit – Riverside Towers', 0, 11, 'Mission Chariali site', 'Planned', rel('deals', 'de1')],
    ['Tender pre-bid meeting', 2, 15, 'TMC Engineering office', 'Planned', rel('leads', 'le1')],
    ['Quarterly review – Kamakhya Hardware', -3, 12, 'Biswanath Chariali', 'Held', rel('accounts', 'ac3')],
  ].map(([title, d, h, location, status, relatedTo], i) => ({ id: 'me' + (i + 1), title, from: at(d, h), to: at(d, h + 1), location, status, relatedTo, participants: '', agenda: '', ...base(i, 'u2') }));
  crm.calls = [
    ['Intro call', 'Outbound', -2, 10, 'Completed', 'Interested', rel('leads', 'le2')],
    ['Price enquiry', 'Inbound', -1, 4, 'Completed', 'Quotation requested', rel('leads', 'le9')],
    ['Payment follow-up', 'Outbound', 0, 0, 'Scheduled', '', rel('accounts', 'ac2')],
    ['Callback – fabrication needs', 'Outbound', 1, 0, 'Scheduled', '', rel('leads', 'le8')],
  ].map(([subject, callType, d, duration, status, result, relatedTo], i) => ({ id: 'ca' + (i + 1), subject, callType, callTime: at(d, 16), duration, status, result, relatedTo, summary: '', ...base(i, i % 2 ? 'u6' : 'u2') }));

  crm.notes = [
    { id: 'nt1', module: 'deals', recordId: 'de1', at: ago(3), by: 'Sales Manager', text: 'Client wants 12 mm and 16 mm split 60/40; asked for 1% extra on volume above 50 MT.' },
    { id: 'nt2', module: 'leads', recordId: 'le1', at: ago(5), by: 'Sales Manager', text: 'Tender opens next week. EMD to be confirmed by accounts.' },
  ];
  for (const m of ['leads', 'contacts', 'accounts', 'deals', 'tasks', 'meetings', 'calls', 'campaigns'])
    for (const r of crm[m]) crm.timeline.push({ id: 'tl-' + r.id, module: m, recordId: r.id, at: r.createdAt, by: r.createdBy, text: 'Record created' });

  crm.target = 5000000;
  db.crm = crm;
}
