import { useCallback, useEffect, useState } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { DEMO_MODES, DEMO_STATUS, PRODUCTS } from '../constants.js';
import { ago, fmtDate, fmtDateTime } from '../utils.js';
import { Modal } from '../components/Bits.jsx';
import DemoRequestModal from '../components/DemoRequestModal.jsx';

const StatusPill = ({ status }) => <span className={'pill demo-' + status}>{DEMO_STATUS[status] || status}</span>;
const when = (s) => (s ? new Date(s.length === 16 ? s + ':00' : s).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');

export default function Demos(){
  const { user, call, showToast, setPendingDemos } = useApp();
  const isAdmin = user.role === 'admin';
  const [status, setStatus] = useState(isAdmin ? 'pending' : '');
  const [rows, setRows] = useState([]);
  const [myLeads, setMyLeads] = useState([]);
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState(null);

  const load = useCallback(() => {
    call('listDemoRequests', { status }).then((d) => { setRows(d.requests); setPendingDemos(d.pending); }).catch((e) => showToast(e.message, 'err'));
  }, [call, status, showToast, setPendingDemos]);
  useEffect(load, [load]);
  useEffect(() => { if (!isAdmin) call('listLeads', { limit: 300 }).then((d) => setMyLeads(d.leads)).catch(() => {}); }, [isAdmin, call]);

  const cancel = (r) => confirm('Cancel this demo request?') && call('cancelDemoRequest', { id: r.id }).then(() => { showToast('Request cancelled.'); load(); }).catch((e) => showToast(e.message, 'err'));

  return (
    <div className="page">
      <header className="page-head"><h1>Demo requests</h1>
        {!isAdmin && <button className="btn primary" onClick={() => setCreating(true)}>+ Request a demo</button>}</header>
      <p className="muted" style={{ margin: 0 }}>{isAdmin ? 'Requests from your sales team, newest and pending first. Open one to schedule, decline or complete it.' : 'Ask the DTA team to give your client a demo. You will see here when it is scheduled.'}</p>
      <div className="filters">
        {['', 'pending', 'scheduled', 'completed', 'declined'].map((s) => (
          <button key={s || 'all'} className={'chip' + (status === s ? ' on' : '')} onClick={() => setStatus(s)}>{s ? DEMO_STATUS[s] : 'All'}</button>))}
      </div>
      <div className="card table-wrap">
        <table className="table">
          <thead><tr><th>Client</th>{isAdmin && <th>Requested by</th>}<th>Demo</th><th>Preferred</th><th>Status</th><th>Scheduled</th><th /></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td><button className="link" onClick={() => setOpen(r)}>{r.clientName}</button><div className="muted small">{r.state}{r.city ? ', ' + r.city : ''}{r.phone ? ' · ' + r.phone : ''}</div></td>
                {isAdmin && <td>{r.employee}<div className="muted small">{ago(r.createdAt)}</div></td>}
                <td>{PRODUCTS[r.productType]}{r.productName && <div className="muted small">{r.productName}</div>}<div className="muted small">{r.mode === 'onsite' ? 'On-site' : 'Online'}</div></td>
                <td>{fmtDate(r.preferredDate)}{r.preferredTime && <div className="muted small">{r.preferredTime}</div>}</td>
                <td><StatusPill status={r.status} /></td>
                <td>{when(r.scheduledAt)}</td>
                <td className="num actions-cell">{!isAdmin && r.status === 'pending' && <button className="link danger" onClick={() => cancel(r)}>Cancel</button>}</td>
              </tr>))}
            {!rows.length && <tr><td colSpan="7" className="muted">{isAdmin ? 'No demo requests here.' : 'No requests yet — use “Request a demo”.'}</td></tr>}
          </tbody>
        </table>
      </div>
      {creating && <DemoRequestModal leads={myLeads} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); load(); }} />}
      {open && <DemoDetail r={open} isAdmin={isAdmin} onClose={() => setOpen(null)} onSaved={() => { setOpen(null); load(); }} />}
    </div>
  );
}

function DemoDetail({ r, isAdmin, onClose, onSaved }){
  const { call, showToast } = useApp();
  const [f, setF] = useState({ status: r.status === 'pending' ? 'scheduled' : r.status, scheduledAt: r.scheduledAt ? r.scheduledAt.slice(0, 16) : (r.preferredDate ? r.preferredDate + 'T11:00' : ''), adminNote: r.adminNote || '' });
  const editable = isAdmin && r.status !== 'cancelled';
  const save = (e) => { e.preventDefault(); call('updateDemoRequest', { id: r.id, ...f }).then(() => { showToast('Demo request updated.'); onSaved(); }).catch((err) => showToast(err.message, 'err')); };

  return (
    <Modal title={r.clientName} onClose={onClose} wide>
      <dl className="kv">
        <dt>Status</dt><dd><StatusPill status={r.status} /></dd>
        {isAdmin && <><dt>Requested by</dt><dd>{r.employee} ({r.employeeState}) · {fmtDateTime(r.createdAt)}</dd></>}
        <dt>Client</dt><dd>{[r.contactPerson, r.phone].filter(Boolean).join(' · ') || '—'}<br />{r.state}{r.city ? ', ' + r.city : ''}</dd>
        <dt>Demo of</dt><dd>{PRODUCTS[r.productType]}{r.productName ? ' — ' + r.productName : ''} · {DEMO_MODES[r.mode]}</dd>
        <dt>Preferred</dt><dd>{fmtDate(r.preferredDate)}{r.preferredTime ? ' · ' + r.preferredTime : ''}</dd>
        {r.notes && <><dt>Notes</dt><dd style={{ whiteSpace: 'pre-wrap' }}>{r.notes}</dd></>}
        {!isAdmin && r.scheduledAt && <><dt>Scheduled for</dt><dd><b>{when(r.scheduledAt)}</b></dd></>}
        {!isAdmin && r.adminNote && <><dt>Message from DTA</dt><dd style={{ whiteSpace: 'pre-wrap' }}>{r.adminNote}</dd></>}
      </dl>
      {editable && (
        <form className="form-grid" onSubmit={save} style={{ marginTop: 16 }}>
          <label>Update status<select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
            {['pending', 'scheduled', 'completed', 'declined'].map((s) => <option key={s} value={s}>{DEMO_STATUS[s]}</option>)}</select></label>
          {(f.status === 'scheduled' || f.status === 'completed') && <label>Demo date &amp; time<input type="datetime-local" required={f.status === 'scheduled'} value={f.scheduledAt} onChange={(e) => setF({ ...f, scheduledAt: e.target.value })} /></label>}
          <label className="span2">Message to the employee<textarea rows="3" placeholder="e.g. Demo link, who will attend, or why it was declined" value={f.adminNote} onChange={(e) => setF({ ...f, adminNote: e.target.value })} /></label>
          <div className="span2 actions"><button type="button" className="btn ghost" onClick={onClose}>Close</button><button className="btn primary">Save</button></div>
        </form>
      )}
    </Modal>
  );
}
