// Demo data for HR, leads and loyalty. All fictional.
import { addDays, round2 } from './format.js';
import { ROLES } from './calc.js';

const SALARY = { owner: 0, sales_manager: 32000, cashier: 18000, warehouse: 16000, accounts: 24000, salesman: 17000, security: 12000, delivery: 13000 };

export function addExtras(db, rnd) {
  const now = new Date();
  for (const u of db.users) {
    db.hr.profiles[u.id] = {
      salary: SALARY[u.role] ?? 15000, joinDate: '2024-04-01', designation: u.role === 'owner' ? 'Proprietor' : ROLES[u.role],
      phone: '', bank: '', onPayroll: u.role !== 'owner',
    };
  }

  // Attendance for the last 30 days (Mon–Sat), with the odd late arrival or absence.
  for (let d = 30; d >= 1; d--) {
    const day = new Date(now); day.setDate(day.getDate() - d);
    if (day.getDay() === 0) continue;
    for (const u of db.users) {
      if (u.role === 'owner' || rnd() < 0.05) continue;
      const inAt = new Date(day); inAt.setHours(9, 10 + Math.floor(rnd() * 40), 0, 0);
      const outAt = new Date(day); outAt.setHours(18, Math.floor(rnd() * 50), 0, 0);
      db.hr.attendance.push({ id: `at-${u.id}-${d}`, userId: u.id, date: inAt.toISOString().slice(0, 10), in: inAt.toISOString(), out: outAt.toISOString() });
    }
  }

  const d = (n) => addDays(now.toISOString(), n).slice(0, 10);
  db.hr.leaves.push(
    { id: 'lv1', userId: 'u3', from: d(-12), to: d(-12), days: 1, type: 'Casual', reason: 'Family function', status: 'approved', decidedBy: 'Abhimanyu Chhawchharia', at: addDays(now.toISOString(), -15) },
    { id: 'lv2', userId: 'u4', from: d(3), to: d(4), days: 2, type: 'Casual', reason: 'Travel to village', status: 'pending', at: addDays(now.toISOString(), -1) },
  );
  db.hr.advances.push(
    { id: 'ad1', userId: 'u6', amount: 5000, reason: 'Medical', status: 'approved', decidedBy: 'Abhimanyu Chhawchharia', at: addDays(now.toISOString(), -10), recoverMonth: now.toISOString().slice(0, 7) },
    { id: 'ad2', userId: 'u7', amount: 2000, reason: 'Festival', status: 'pending', at: addDays(now.toISOString(), -2) },
  );

  // Sales pipeline.
  const leads = [
    ['Tezpur Medical College – Hostel Block', 'Mr. Baruah', '9800000201', 'Govt. tender', 'TMT 12/16 mm, ~40 MT', 2600000, 'quoted', 2],
    ['Sonitpur Rice Mill Shed', 'Mr. Agarwal', '9800000202', 'Walk-in', 'Structurals for shed, ~12 MT', 850000, 'contacted', -1],
    ['Green Valley Apartments', 'Ms. Hazarika', '9800000203', 'Referral', 'TMT all sizes, phased', 3400000, 'new', 0],
    ['Biswanath PWD Culvert', 'Er. Saikia', '9800000204', 'Field visit', 'TMT 10/12 mm', 620000, 'quoted', -3],
    ['Dhekiajuli School Extension', 'Mr. Bora', '9800000205', 'Phone', 'TMT + binding wire', 410000, 'contacted', 4],
    ['North Bank Warehousing', 'Mr. Jain', '9800000206', 'Referral', 'ISMC channels + angles', 1250000, 'won', null],
    ['Rangapara Petrol Pump Canopy', 'Mr. Das', '9800000207', 'Walk-in', 'Square pipes', 180000, 'lost', null],
  ];
  for (const [name, contact, phone, source, need, value, stage, follow] of leads) {
    const no = ++db.seq.LD;
    db.leads.push({
      id: 'ld' + no, no: 'LD-' + String(no).padStart(3, '0'), name, contact, phone, source, need, value, stage,
      ownerId: rnd() < 0.5 ? 'u2' : 'u6', created: addDays(now.toISOString(), -10 - no * 3),
      followUp: follow == null ? '' : d(follow),
      notes: [{ at: addDays(now.toISOString(), -8), by: 'Sales Manager', text: 'First discussion done; site visit planned.' }],
      lostReason: stage === 'lost' ? 'Price — went with a Guwahati supplier' : '',
    });
  }

  // Loyalty points earned on past credit and retail customers' bills.
  const lp = db.settings.loyalty;
  for (const inv of db.invoices) {
    if (inv.customerId === 'walkin') continue;
    const pts = Math.floor(inv.total / 100 * lp.pointsPer100);
    if (pts > 0) db.loyalty.push({ id: 'ly-' + inv.id, customerId: inv.customerId, at: inv.date, points: pts, ref: inv.no, note: 'Earned on bill' });
  }
  const c7 = db.loyalty.find((l) => l.customerId === 'c7');
  if (c7) db.loyalty.push({ id: 'ly-r1', customerId: 'c7', at: addDays(now.toISOString(), -5), points: -round2(Math.min(200, c7.points)), ref: 'Redeemed', note: 'Redeemed at counter' });
}
