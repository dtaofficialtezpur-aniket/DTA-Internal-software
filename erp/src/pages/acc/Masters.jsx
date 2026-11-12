import { useMemo, useState } from 'react';
import { useStore } from '../../lib/store.jsx';
import { allVouchers, balances, drcr, groupIds, groupPath, ledgerList } from '../../lib/accounts.js';
import { Empty, Icon, PageHead, Search, Tabs } from '../../components/ui.jsx';
import { DemoLeft } from '../../components/ui.jsx';
import { go, GroupForm, groupOptions, LedgerForm, stash } from './shared.jsx';

export default function Masters() {
  const { db, user, update, toast } = useStore();
  const [tab, setTab] = useState('ledgers');
  const [q, setQ] = useState('');
  const [grp, setGrp] = useState('');
  const [edit, setEdit] = useState(null);
  const [newGroup, setNewGroup] = useState(false);
  const canEdit = ['owner', 'accounts'].includes(user.role);
  const leds = useMemo(() => ledgerList(db), [db]);
  const bal = useMemo(() => balances(db), [db]);
  const used = useMemo(() => new Set(allVouchers(db).flatMap((v) => v.lines.map((l) => l.ledger))), [db]);
  const ids = grp ? groupIds(db, grp) : null;
  const rows = leds.filter((l) => (!ids || ids.has(l.group)) && l.name.toLowerCase().includes(q.toLowerCase()));
  const gname = (id) => db.acc.groups.find((g) => g.id === id)?.name;

  const del = (l) => {
    if (!confirm(`Delete ledger "${l.name}"?`)) return;
    update((d) => { d.acc.ledgers = d.acc.ledgers.filter((x) => x.id !== l.id); }, ['Deleted ledger', 'Ledger', l.name]);
    toast('Ledger deleted');
  };
  const delGroup = (g) => {
    if (!confirm(`Delete group "${g.name}"?`)) return;
    update((d) => { d.acc.groups = d.acc.groups.filter((x) => x.id !== g.id); }, ['Deleted account group', 'Group', g.name]);
  };
  return (
    <div className="page">
      <PageHead title="Accounting Masters" sub="Ledgers and groups: the chart of accounts">
        {canEdit && tab === 'ledgers' && <><DemoLeft kind="acc_ledger" /><button className="btn primary" onClick={() => setEdit({})}><Icon name="plus" />Create ledger</button></>}
        {canEdit && tab === 'groups' && <><DemoLeft kind="acc_group" /><button className="btn primary" onClick={() => setNewGroup(true)}><Icon name="plus" />Create group</button></>}
      </PageHead>
      <div className="card">
        <div className="card-head wrap">
          <Tabs value={tab} onChange={setTab} items={[['ledgers', `Ledgers (${leds.length})`], ['groups', `Groups (${db.acc.groups.length})`]]} />
          {tab === 'ledgers' && <div className="row wrap">
            <select className="input" style={{ width: 'auto' }} value={grp} onChange={(e) => setGrp(e.target.value)}><option value="">All groups</option>{groupOptions(db).map((g) => <option key={g.id} value={g.id}>{'— '.repeat(groupPath(db, g.id).length - 1)}{g.name}</option>)}</select>
            <div style={{ width: 240 }}><Search value={q} onChange={setQ} placeholder="Search ledgers" /></div>
          </div>}
        </div>
        {tab === 'ledgers' ? (
          <div className="table-wrap"><table className="t">
            <thead><tr><th>Ledger</th><th>Under</th><th className="num">Opening</th><th className="num">Current balance</th><th /></tr></thead>
            <tbody>{rows.slice(0, 300).map((l) => (
              <tr key={l.id} className="click" onClick={() => { stash('ledger', { id: l.id, period: null }); go('accl'); }}>
                <td className="strong">{l.name}{l.virtual && <span className="badge" style={{ marginLeft: 6 }}>from {l.virtual === 'customer' ? 'Customers' : 'Suppliers'}</span>}</td>
                <td className="small">{gname(l.group)}</td><td className="num">{drcr(l.opening || 0)}</td><td className="num strong">{drcr(bal.get(l.id)?.close || 0)}</td>
                <td className="right" onClick={(e) => e.stopPropagation()}>{canEdit && !l.virtual && <div className="actions" style={{ justifyContent: 'flex-end' }}>
                  <button className="btn sm" onClick={() => setEdit(l)}><Icon name="edit" />Alter</button>
                  <button className="btn sm danger" disabled={used.has(l.id)} title={used.has(l.id) ? 'Has transactions' : 'Delete'} onClick={() => del(l)}><Icon name="trash" /></button>
                </div>}</td>
              </tr>
            ))}</tbody>
          </table>{!rows.length && <Empty icon="book" text="No ledgers match." />}</div>
        ) : (
          <div className="table-wrap"><table className="t">
            <thead><tr><th>Group</th><th>Under</th><th>Nature</th><th className="num">Ledgers</th><th /></tr></thead>
            <tbody>{groupOptions(db).map((g) => (
              <tr key={g.id}><td className="strong" style={{ paddingLeft: 14 + (groupPath(db, g.id).length - 1) * 20 }}>{g.name}</td><td className="small">{g.parent ? gname(g.parent) : 'Primary'}</td>
                <td>{{ A: 'Asset', L: 'Liability', I: 'Income', E: 'Expense' }[g.nature]}{g.trading ? ' · trading' : ''}</td>
                <td className="num">{leds.filter((l) => l.group === g.id).length}</td>
                <td className="right">{canEdit && !g.system && <button className="btn sm danger" disabled={leds.some((l) => l.group === g.id)} onClick={() => delGroup(g)}><Icon name="trash" /></button>}</td></tr>
            ))}</tbody>
          </table></div>
        )}
      </div>
      {edit && <LedgerForm ledger={edit.id ? edit : null} group={grp || undefined} onClose={() => setEdit(null)} />}
      {newGroup && <GroupForm onClose={() => setNewGroup(false)} />}
    </div>
  );
}
