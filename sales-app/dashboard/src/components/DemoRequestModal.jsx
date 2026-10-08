import { useState } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { DEMO_MODES, PRODUCTS, STATES } from '../constants.js';
import { todayStr } from '../utils.js';
import { Modal } from './Bits.jsx';

// Employee asks the DTA team for a demo. Prefilled from a lead when opened from one.
export default function DemoRequestModal({ lead, leads = [], onClose, onSaved }){
  const { user, call, showToast } = useApp();
  const fromLead = (l) => l ? { leadId: l.id, clientName: l.name, contactPerson: l.contactPerson || '', phone: l.phone || '', state: l.state, city: l.city || '', productType: l.productType, productName: l.productName || '' } : {};
  const [f, setF] = useState({ leadId: '', clientName: '', contactPerson: '', phone: '', state: user.state || '', city: '', productType: 'software', productName: '',
    mode: 'online', preferredDate: '', preferredTime: '', notes: '', ...fromLead(lead) });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  function pickLead(e){
    const l = leads.find((x) => String(x.id) === e.target.value);
    setF(l ? { ...f, ...fromLead(l) } : { ...f, leadId: '' });
  }
  function submit(e){
    e.preventDefault();
    setBusy(true);
    call('addDemoRequest', f).then(() => { showToast('Demo request sent to the DTA team.'); onSaved(); })
      .catch((err) => { showToast(err.message, 'err'); setBusy(false); });
  }

  return (
    <Modal title="Request a demo from the DTA team" onClose={onClose} wide>
      <form className="form-grid" onSubmit={submit}>
        {!lead && leads.length > 0 && (
          <label className="span2">For one of my leads (optional)
            <select value={f.leadId} onChange={pickLead}><option value="">— new / not in my leads —</option>{leads.filter((l) => l.stage !== 'lost').map((l) => <option key={l.id} value={l.id}>{l.name} · {l.state}</option>)}</select>
          </label>
        )}
        <label className="span2">Client / business name *<input required value={f.clientName} onChange={set('clientName')} /></label>
        <label>Contact person<input value={f.contactPerson} onChange={set('contactPerson')} /></label>
        <label>Phone<input inputMode="tel" value={f.phone} onChange={set('phone')} /></label>
        <label>State *<select required value={f.state} onChange={set('state')}><option value="">Select…</option>{STATES.map((s) => <option key={s}>{s}</option>)}</select></label>
        <label>City / district<input value={f.city} onChange={set('city')} /></label>
        <label>Demo of *<select value={f.productType} onChange={set('productType')}>{Object.entries(PRODUCTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label>Which one?<input placeholder="e.g. billing software" value={f.productName} onChange={set('productName')} /></label>
        <label>Type of demo<select value={f.mode} onChange={set('mode')}>{Object.entries(DEMO_MODES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label>Preferred date<input type="date" min={todayStr()} value={f.preferredDate} onChange={set('preferredDate')} /></label>
        <label className="span2">Preferred time<input placeholder="e.g. Morning, after 4 PM" value={f.preferredTime} onChange={set('preferredTime')} /></label>
        <label className="span2">Notes for the DTA team<textarea rows="3" placeholder="What does the client need? Anything to focus on in the demo?" value={f.notes} onChange={set('notes')} /></label>
        <div className="span2 actions"><button type="button" className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy}>Send request</button></div>
      </form>
    </Modal>
  );
}
