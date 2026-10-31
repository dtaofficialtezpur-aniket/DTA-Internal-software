import { useState } from 'react';
import { useStore } from '../lib/store.jsx';
import { dateTime, downloadCsv } from '../lib/format.js';
import { Empty, Icon, PageHead, Search } from '../components/ui.jsx';

export default function Audit() {
  const { db } = useStore();
  const [q, setQ] = useState('');
  const [who, setWho] = useState('');
  const [entity, setEntity] = useState('');
  const entities = [...new Set(db.audit.map((a) => a.entity))].sort();
  const list = db.audit.filter((a) => (!who || a.userId === who) && (!entity || a.entity === entity) &&
    (a.action + a.detail + a.userName).toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="page">
      <PageHead title="Audit Trail" sub="Every change is recorded with who did it and when. Entries cannot be edited or deleted.">
        <button className="btn" onClick={() => downloadCsv('audit-trail.csv', [['Time', 'User', 'Action', 'Area', 'Detail'], ...list.map((a) => [dateTime(a.ts), a.userName, a.action, a.entity, a.detail])])}><Icon name="download" />Export CSV</button>
      </PageHead>
      <div className="card">
        <div className="card-head wrap">
          <div className="row wrap">
            <select className="input" style={{ width: 'auto' }} value={who} onChange={(e) => setWho(e.target.value)}><option value="">All users</option>{db.users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
            <select className="input" style={{ width: 'auto' }} value={entity} onChange={(e) => setEntity(e.target.value)}><option value="">All areas</option>{entities.map((e) => <option key={e}>{e}</option>)}</select>
          </div>
          <div style={{ width: 280 }}><Search value={q} onChange={setQ} placeholder="Search activity" /></div>
        </div>
        <div className="table-wrap"><table className="t">
          <thead><tr><th>Time</th><th>User</th><th>Action</th><th>Area</th><th>Detail</th></tr></thead>
          <tbody>{list.slice(0, 300).map((a) => (
            <tr key={a.id}><td className="small" style={{ whiteSpace: 'nowrap' }}>{dateTime(a.ts)}</td><td>{a.userName}</td>
              <td><span className={`badge ${a.action === 'Failed login' || /Cancel|Delete/.test(a.action) ? 'bad' : /Approved|Received|verified/i.test(a.action) ? 'ok' : 'blue'}`}>{a.action}</span></td>
              <td className="small">{a.entity}</td><td className="small">{a.detail}</td></tr>
          ))}</tbody>
        </table>{!list.length && <Empty icon="history" text="No activity matches." />}</div>
      </div>
    </div>
  );
}
