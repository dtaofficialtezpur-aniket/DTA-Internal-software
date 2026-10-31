import { useStore } from '../lib/store.jsx';
import { agingBuckets, cycleCountDue, invoiceDue, isLowStock } from '../lib/calc.js';
import { money, qty, dateTime, daysBetween } from '../lib/format.js';
import { Bars, HBar, Icon, PageHead, Stat } from '../components/ui.jsx';

export default function Dashboard() {
  const { db, user } = useStore();
  const live = db.invoices.filter((i) => !i.cancelled);
  const todayKey = new Date().toDateString();
  const todays = live.filter((i) => new Date(i.date).toDateString() === todayKey);
  const monthKey = new Date().toISOString().slice(0, 7);
  const month = live.filter((i) => i.date.slice(0, 7) === monthKey);
  const outstanding = live.reduce((s, i) => s + invoiceDue(i), 0);
  const overdue = live.filter((i) => invoiceDue(i) > 0.5 && new Date(i.dueDate) < new Date());
  const low = db.products.filter(isLowStock);
  const aging = agingBuckets(db, live);
  const agingMax = Math.max(1, ...Object.values(aging));

  const days = [...Array(14)].map((_, k) => {
    const d = new Date(); d.setDate(d.getDate() - (13 - k));
    const key = d.toDateString();
    return { label: d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }).replace(' ', ' '), value: live.filter((i) => new Date(i.date).toDateString() === key).reduce((s, i) => s + i.total, 0), highlight: k === 13 };
  });

  const byProduct = {};
  for (const i of month) for (const l of i.items) byProduct[l.productId] = (byProduct[l.productId] || 0) + l.taxable;
  const top = Object.entries(byProduct).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const topMax = top[0]?.[1] || 1;
  const openSessions = db.sessions.filter((s) => !s.closedAt);
  const pendingPO = db.purchaseOrders.filter((p) => p.status === 'pending_approval');
  const pendingPick = db.picklists.filter((p) => p.status !== 'dispatched');
  const hour = new Date().getHours();

  return (
    <div className="page">
      <PageHead title={`Good ${hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'}, ${user.name.split(' ')[0]}`}
        sub={new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}>
        <a className="btn" href="#/reports"><Icon name="chart" />Reports</a>
        <a className="btn primary" href="#/pos"><Icon name="pos" />New Bill</a>
      </PageHead>

      <div className="grid g4 stagger">
        <Stat label="Today's sales" value={todays.reduce((s, i) => s + i.total, 0)} sub={`${todays.length} bills`} icon="pos" />
        <Stat label="This month" value={month.reduce((s, i) => s + i.total, 0)} sub={`${month.length} bills · ${qty(month.reduce((s, i) => s + i.items.reduce((a, l) => a + (l.factor * l.qty), 0), 0) / 1000)} MT moved`} icon="chart" tone="gold" />
        <Stat label="Receivables" value={outstanding} sub={`${overdue.length} invoices overdue`} icon="wallet" tone={overdue.length ? 'red' : ''} />
        <Stat label="Stock value" value={db.products.reduce((s, p) => s + p.stock * p.cost, 0)} sub={`${low.length} items below reorder level`} icon="layers" tone="green" />
      </div>

      <div className="grid g-main mt stagger">
        <div className="card">
          <div className="card-head"><div><h3>Sales — last 14 days</h3><p>Invoice value including GST</p></div><span className="badge blue"><span className="dot live" style={{ background: 'var(--ok)' }} />Live</span></div>
          <div className="card-body"><Bars data={days} /></div>
        </div>
        <div className="card">
          <div className="card-head"><div><h3>Receivables ageing</h3><p>Days past due date</p></div><a className="btn sm" href="#/collections">Collect</a></div>
          <div className="card-body grid" style={{ gap: 14 }}>
            {Object.entries(aging).map(([k, v], i) => (
              <div key={k}>
                <div className="row between small"><span>{k === 'current' ? 'Not yet due' : `${k} days`}</span><b>{money(v)}</b></div>
                <HBar pct={v / agingMax * 100} tone={i >= 3 ? 'red' : i === 2 ? 'gold' : ''} />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid g3 mt stagger">
        <div className="card">
          <div className="card-head"><h3>Top products this month</h3></div>
          {top.length ? top.map(([pid, v]) => {
            const p = db.products.find((x) => x.id === pid);
            return (
              <div className="list-row" key={pid}>
                <div className="grow"><div className="small strong">{p?.name}</div><HBar pct={v / topMax * 100} /></div>
                <div className="small right" style={{ minWidth: 90 }}>{money(v)}</div>
              </div>
            );
          }) : <div className="empty">No sales yet this month.</div>}
        </div>

        <div className="card">
          <div className="card-head"><h3>Needs attention</h3></div>
          <AttentionRow icon="cart" tone="gold" text={`${pendingPO.length} purchase order(s) awaiting approval`} href="#/purchase" />
          <AttentionRow icon="truck" text={`${pendingPick.length} warehouse order(s) not yet dispatched`} href="#/warehouse" />
          <AttentionRow icon="alert" tone="red" text={`${low.length} item(s) below reorder level`} href="#/inventory" />
          <AttentionRow icon="layers" text={`${cycleCountDue(db).length} item(s) due for cycle count today`} href="#/inventory" />
          <AttentionRow icon="wallet" tone="red" text={`${overdue.length} overdue invoice(s) to follow up`} href="#/collections" />
          <AttentionRow icon="clock" text={`${openSessions.length} cashier session(s) open`} href="#/pos" />
          <AttentionRow icon="target" tone="gold" text={`${db.leads.filter((l) => !['won', 'lost'].includes(l.stage) && l.followUp && l.followUp <= new Date().toISOString().slice(0, 10)).length} lead follow-up(s) due`} href="#/crm" />
          <AttentionRow icon="briefcase" text={`${db.hr.leaves.filter((l) => l.status === 'pending').length + db.hr.advances.filter((a) => a.status === 'pending').length} leave / advance request(s) pending`} href="#/hr" />
        </div>

        <div className="card">
          <div className="card-head"><h3>Recent activity</h3><a className="btn sm ghost" href="#/audit">View all</a></div>
          {db.audit.slice(0, 7).map((a) => (
            <div className="list-row" key={a.id}>
              <div className="avatar" style={{ width: 26, height: 26, fontSize: 10, background: 'var(--primary-50)', color: 'var(--primary)' }}>{a.userName.split(' ').map((w) => w[0]).join('').slice(0, 2)}</div>
              <div className="grow small"><b>{a.action}</b> <span className="muted">{a.detail}</span></div>
              <div className="small muted" title={dateTime(a.ts)}>{ago(a.ts)}</div>
            </div>
          ))}
          {!db.audit.length && <div className="empty">No activity yet.</div>}
        </div>
      </div>
    </div>
  );
}

function AttentionRow({ icon, text, href, tone = '' }) {
  return (
    <a className="list-row" href={href} style={{ textDecoration: 'none', color: 'inherit' }}>
      <span className={`mini-ic ${tone}`}><Icon name={icon} /></span>
      <div className="grow small">{text}</div>
      <Icon name="arrowUp" style={{ width: 14, height: 14, color: 'var(--muted)' }} />
    </a>
  );
}

function ago(ts) {
  const m = Math.floor((Date.now() - new Date(ts)) / 60000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  if (m < 1440) return `${Math.floor(m / 60)}h`;
  return `${daysBetween(ts)}d`;
}
