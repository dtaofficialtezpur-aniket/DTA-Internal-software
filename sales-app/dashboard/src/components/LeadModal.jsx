import { useEffect, useState } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { ACTIVITY_LABELS, ACTIVITY_TYPES, PRODUCTS, STAGES, STATES } from '../constants.js';
import { fmtDateTime } from '../utils.js';
import { Modal } from './Bits.jsx';

const blank = (state) => ({ name: '', contactPerson: '', phone: '', email: '', state: state || '', city: '', productType: 'software', productName: '', stage: 'new', estValue: '', dealValue: '', nextFollowup: '', notes: '' });

export default function LeadModal({ lead, readOnly, onClose, onSaved }){
  const { user, call, showToast } = useApp();
  const [f, setF] = useState(lead ? { ...blank(), ...Object.fromEntries(Object.entries(lead).map(([k, v]) => [k, v ?? ''])) } : blank(user.state));
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState([]);
  const [act, setAct] = useState({ type: 'call', note: '' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const loadHistory = () => lead && call('listActivities', { leadId: lead.id, limit: 30 }).then((d) => setHistory(d.activities)).catch(() => {});
  useEffect(() => { loadHistory(); /* eslint-disable-next-line */ }, [lead?.id]);

  function save(e){
    e.preventDefault();
    setBusy(true);
    call(lead ? 'updateLead' : 'addLead', { ...f, id: lead?.id }).then(() => { showToast(lead ? 'Lead updated.' : 'Lead added.'); onSaved(); })
      .catch((err) => { showToast(err.message, 'err'); setBusy(false); });
  }
  function logActivity(e){
    e.preventDefault();
    call('addActivity', { leadId: lead.id, ...act }).then(() => { setAct({ ...act, note: '' }); showToast('Activity logged.'); loadHistory(); onSaved(true); })
      .catch((err) => showToast(err.message, 'err'));
  }

  return (
    <Modal title={lead ? (readOnly ? lead.name : 'Edit lead') : 'Add a lead'} onClose={onClose} wide>
      <form className="form-grid" onSubmit={save}>
        <fieldset disabled={readOnly}>
          <label className="span2">Business / customer name *<input required value={f.name} onChange={set('name')} /></label>
          <label>Contact person<input value={f.contactPerson} onChange={set('contactPerson')} /></label>
          <label>Phone<input inputMode="tel" value={f.phone} onChange={set('phone')} /></label>
          <label>Email<input type="email" value={f.email} onChange={set('email')} /></label>
          <label>State *<select required value={f.state} onChange={set('state')}><option value="">Select…</option>{STATES.map((s) => <option key={s}>{s}</option>)}</select></label>
          <label>City / district<input value={f.city} onChange={set('city')} /></label>
          <label>Selling *<select value={f.productType} onChange={set('productType')}>{Object.entries(PRODUCTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label>What exactly?<input placeholder="e.g. billing software, e-commerce site" value={f.productName} onChange={set('productName')} /></label>
          <label>Expected value (₹)<input type="number" min="0" step="any" value={f.estValue} onChange={set('estValue')} /></label>
          {lead && <label>Stage<select value={f.stage} onChange={set('stage')}>{Object.entries(STAGES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>}
          {lead && f.stage === 'won' && <label>Final deal value (₹)<input type="number" min="0" step="any" placeholder={f.estValue || ''} value={f.dealValue} onChange={set('dealValue')} /></label>}
          <label>Next follow-up<input type="date" value={f.nextFollowup} onChange={set('nextFollowup')} /></label>
          <label className="span2">Notes<textarea rows="3" value={f.notes} onChange={set('notes')} /></label>
        </fieldset>
        {!readOnly && <div className="span2 actions"><button type="button" className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy}>{lead ? 'Save changes' : 'Add lead'}</button></div>}
      </form>

      {lead && (
        <section className="lead-history">
          <h3>Activity on this lead</h3>
          {!readOnly && (
            <form className="log-form" onSubmit={logActivity}>
              <select value={act.type} onChange={(e) => setAct({ ...act, type: e.target.value })}>{Object.entries(ACTIVITY_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
              <input required placeholder="What happened?" value={act.note} onChange={(e) => setAct({ ...act, note: e.target.value })} />
              <button className="btn">Log</button>
            </form>
          )}
          <ul className="feed">{history.map((a) => <li key={a.id}><b>{ACTIVITY_LABELS[a.type] || a.type}</b>{a.note && <> — {a.note}</>}<span className="when">{fmtDateTime(a.createdAt)}</span></li>)}
            {!history.length && <li className="muted">Nothing logged yet.</li>}</ul>
        </section>
      )}
    </Modal>
  );
}
