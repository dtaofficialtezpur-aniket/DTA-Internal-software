import { useCallback, useEffect, useState } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { ACTIVITY_LABELS, ACTIVITY_TYPES } from '../constants.js';
import { fmtDateTime } from '../utils.js';
import { Modal, RangeFilter } from '../components/Bits.jsx';
import { rangePreset } from '../utils.js';

const PRESETS = [['all', 'All time', rangePreset('all')], ['today', 'Today', rangePreset('today')], ['7d', '7 days', rangePreset('7d')], ['30d', '30 days', rangePreset('30d')]];

export default function Activity({ initialUserId }){
  const { user, call, showToast } = useApp();
  const isAdmin = user.role === 'admin';
  const [range, setRange] = useState({ key: 'all', from: '', to: '' });
  const [type, setType] = useState('');
  const [userId, setUserId] = useState(initialUserId ? String(initialUserId) : '');
  const [team, setTeam] = useState([]);
  const [rows, setRows] = useState([]);
  const [more, setMore] = useState(false);
  const [logging, setLogging] = useState(false);
  const [f, setF] = useState({ type: 'call', note: '' });

  const query = { from: range.from, to: range.to, type, userId, limit: 50 };
  const load = useCallback((append) => {
    call('listActivities', { ...query, beforeId: append && rows.length ? rows[rows.length - 1].id : undefined })
      .then((d) => { setRows(append ? [...rows, ...d.activities] : d.activities); setMore(d.hasMore); })
      .catch((e) => showToast(e.message, 'err'));
    // eslint-disable-next-line
  }, [call, range.from, range.to, type, userId, rows.length, showToast]);

  useEffect(() => { load(false); /* eslint-disable-next-line */ }, [range.from, range.to, type, userId]);
  useEffect(() => { if (isAdmin) call('listTeam').then((d) => setTeam(d.team)).catch(() => {}); }, [isAdmin, call]);

  function submit(e){
    e.preventDefault();
    call('addActivity', f).then(() => { showToast('Logged.'); setLogging(false); setF({ type: 'call', note: '' }); load(false); }).catch((err) => showToast(err.message, 'err'));
  }

  return (
    <div className="page">
      <header className="page-head"><h1>{isAdmin ? 'Activity feed' : 'My activity'}</h1>
        {!isAdmin && <button className="btn primary" onClick={() => setLogging(true)}>+ Log activity</button>}</header>
      <RangeFilter range={range} onChange={setRange} presets={PRESETS} />
      <div className="filters">
        <select value={type} onChange={(e) => setType(e.target.value)}><option value="">All types</option>{Object.entries(ACTIVITY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        {isAdmin && <select value={userId} onChange={(e) => setUserId(e.target.value)}><option value="">All employees</option>{team.map((t) => <option key={t.id} value={t.id}>{t.fullName} ({t.state})</option>)}</select>}
      </div>
      <div className="card">
        <ul className="feed big">
          {rows.map((a) => (
            <li key={a.id}>
              <span className={'tag t-' + a.type}>{ACTIVITY_LABELS[a.type] || a.type}</span>
              {isAdmin && <b> {a.employee}{a.state ? ` · ${a.state}` : ''}</b>}
              {a.leadName && <> — {a.leadName}</>}{a.note && <div className="muted">{a.note}</div>}
              <span className="when">{fmtDateTime(a.createdAt)}</span>
            </li>
          ))}
          {!rows.length && <li className="muted">No activity in this period.</li>}
        </ul>
        {more && <button className="btn" onClick={() => load(true)}>Load more</button>}
      </div>
      {logging && (
        <Modal title="Log activity" onClose={() => setLogging(false)}>
          <form className="form-grid" onSubmit={submit}>
            <label>Type<select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>{Object.entries(ACTIVITY_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
            <label className="span2">What did you do?<textarea required rows="3" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></label>
            <div className="span2 actions"><button type="button" className="btn ghost" onClick={() => setLogging(false)}>Cancel</button><button className="btn primary">Save</button></div>
          </form>
          <p className="muted small">To log something about a specific lead, open the lead from My leads.</p>
        </Modal>
      )}
    </div>
  );
}
