import { useEffect, useState } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { BACKEND_URL } from '../constants.js';
import { recognizeDocumentText } from '../ocr/runOcr.js';
import { extractClientFieldsFromText } from '../ocr/extractFields.js';

export default function AddClientModal(){
  const { addClientOpen, setAddClientOpen, addClientType, setAddClientType } = useApp();

  function close(){
    setAddClientOpen(false);
    setAddClientType(null);
  }

  return (
    <div className={'modal-wrap' + (addClientOpen ? ' open' : '')}>
      <div className="modal">
        {addClientType === null && <TypeChooser onChoose={setAddClientType} onCancel={close} />}
        {addClientType === 'subscription' && <SubscriptionClientForm onBack={() => setAddClientType(null)} onDone={close} />}
        {addClientType === 'normal' && <NormalClientForm onBack={() => setAddClientType(null)} onDone={close} />}
      </div>
    </div>
  );
}

function TypeChooser({ onChoose, onCancel }){
  return (
    <div>
      <h2 style={{fontSize:'1.15rem'}}>New client</h2>
      <div className="page-sub">Choose what kind of client you're adding.</div>
      <div style={{display:'flex', flexDirection:'column', gap:'10px', marginTop:'18px'}}>
        <button type="button" id="a-type-subscription" className="btn btn-secondary" style={{justifyContent:'flex-start', textAlign:'left', padding:'14px 16px', height:'auto', whiteSpace:'normal'}} onClick={() => onChoose('subscription')}>
          <div>
            <div style={{fontWeight:700}}>Subscription client</div>
            <div className="page-sub" style={{marginTop:'2px'}}>Gets a Client ID + API key, billing cycle and due-date tracking.</div>
          </div>
        </button>
        <button type="button" id="a-type-normal" className="btn btn-secondary" style={{justifyContent:'flex-start', textAlign:'left', padding:'14px 16px', height:'auto', whiteSpace:'normal'}} onClick={() => onChoose('normal')}>
          <div>
            <div style={{fontWeight:700}}>Normal client</div>
            <div className="page-sub" style={{marginTop:'2px'}}>Just basic details — name, address, contact and payment amounts.</div>
          </div>
        </button>
      </div>
      <div style={{display:'flex', justifyContent:'flex-end', marginTop:'18px'}}>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function DocumentAutofill({ clientType, onFields }){
  const { auth, showToast } = useApp();
  const [status, setStatus] = useState(null); // null, or a progress label string

  // Text-based PDFs go through the backend (fast, no download). A scanned/
  // photographed document — or any PDF the backend can't read text from,
  // or no connection to reach it at all — falls back to OCR running
  // entirely in the browser (see ocr/runOcr.js). Plain image files always
  // go straight to OCR, since the backend only reads PDFs.
  function readViaServer(file){
    const fd = new FormData();
    fd.append('action', 'extractClientDocument');
    fd.append('token', auth.token);
    fd.append('clientType', clientType);
    fd.append('file', file);
    return fetch(BACKEND_URL, { method: 'POST', body: fd }).then((res) => res.json()).then((data) => {
      if (data.error) throw new Error(data.error);
      return data.fields || {};
    });
  }

  function readViaOcr(file){
    return recognizeDocumentText(file, (label) => setStatus(label))
      .then((text) => extractClientFieldsFromText(text, clientType));
  }

  async function onFile(e){
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
    setStatus('Reading document…');
    try {
      let fields;
      if (isPdf){
        try {
          fields = await readViaServer(file);
        } catch (err) {
          setStatus('No text layer found — running OCR locally, this can take a bit…');
          fields = await readViaOcr(file);
        }
      } else {
        setStatus('Running OCR locally, this can take a bit…');
        fields = await readViaOcr(file);
      }
      if (!fields || Object.keys(fields).length === 0){
        throw new Error('Could not recognize any client details in that document.');
      }
      onFields(fields);
      showToast('Filled from document — review before creating');
    } catch (err) {
      showToast('Could not read document: ' + err.message);
    } finally {
      setStatus(null);
    }
  }

  return (
    <div style={{marginTop:'12px'}}>
      <label className="btn btn-secondary btn-sm" style={{cursor: status ? 'default' : 'pointer', display:'inline-flex'}}>
        {status || 'Upload a PDF or photo to autofill'}
        <input type="file" accept=".pdf,image/*" style={{display:'none'}} disabled={!!status} onChange={onFile} />
      </label>
      <div className="page-sub" style={{marginTop:'4px'}}>Works with typed PDFs and scanned/photographed documents — scans just take longer (read locally, nothing uploaded).</div>
    </div>
  );
}

function SubscriptionClientForm({ onBack, onDone }){
  const { settings, call, refreshFromBackend, showToast } = useApp();
  const [client, setClient] = useState('');
  const [software, setSoftware] = useState('');
  const [amount, setAmount] = useState('');
  const [cycle, setCycle] = useState('Monthly');
  const [start, setStart] = useState(new Date().toISOString().slice(0, 10));
  const [grace, setGrace] = useState(settings.grace);

  useEffect(() => {
    setStart(new Date().toISOString().slice(0, 10));
    setGrace(settings.grace);
  }, [settings.grace]);

  function submit(e){
    e.preventDefault();
    const payload = {
      client: client.trim(), software: software.trim(), cycle,
      amount: Number(amount) || 0, start, grace: Number(grace) || settings.grace,
    };
    call('add', payload).then(() => {
      onDone();
      showToast(payload.client + ' added');
      return refreshFromBackend();
    }).catch((err) => showToast('Failed: ' + err.message));
  }

  return (
    <div>
      <h2 style={{fontSize:'1.15rem'}}>Add a subscription client</h2>
      <div className="page-sub">Creates a Client ID and API key for a new DTA software deployment.</div>
      <DocumentAutofill clientType="subscription" onFields={(f) => {
        if (f.clientName) setClient(f.clientName);
        if (f.softwareName) setSoftware(f.softwareName);
        if (f.amount != null) setAmount(String(f.amount));
        if (f.cycle === 'Monthly' || f.cycle === 'Annual') setCycle(f.cycle);
        if (f.startDate) setStart(f.startDate);
      }} />
      <form id="add-form" onSubmit={submit}>
        <div className="form-grid">
          <label className="full">Client company name
            <input id="a-client" type="text" autoComplete="off" required maxLength={255} placeholder="e.g. Coastal Traders LLP" value={client} onChange={(e) => setClient(e.target.value)} />
          </label>
          <label className="full">Software name
            <input id="a-software" type="text" autoComplete="off" required maxLength={255} placeholder="e.g. Coastal Billing" value={software} onChange={(e) => setSoftware(e.target.value)} />
          </label>
          <label>Plan amount (₹)
            <input id="a-amount" type="number" min="0.01" step="0.01" required placeholder="5000" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </label>
          <label>Billing cycle
            <select id="a-cycle" value={cycle} onChange={(e) => setCycle(e.target.value)}>
              <option value="Monthly">Monthly</option>
              <option value="Annual">Annual</option>
            </select>
          </label>
          <label>Start date
            <input id="a-start" type="date" required value={start} onChange={(e) => setStart(e.target.value)} />
          </label>
          <label>Grace period (days)
            <input id="a-grace" type="number" min="0" value={grace} onChange={(e) => setGrace(e.target.value)} />
          </label>
        </div>
        <div style={{display:'flex', justifyContent:'space-between', gap:'8px', marginTop:'18px'}}>
          <button type="button" className="btn btn-ghost" onClick={onBack}>Back</button>
          <div style={{display:'flex', gap:'8px'}}>
            <button id="a-cancel" type="button" className="btn btn-ghost" onClick={onDone}>Cancel</button>
            <button type="submit" className="btn btn-primary">Create client</button>
          </div>
        </div>
      </form>
    </div>
  );
}

function NormalClientForm({ onBack, onDone }){
  const { call, refreshFromBackend, showToast } = useApp();
  const [client, setClient] = useState('');
  const [address, setAddress] = useState('');
  const [contact, setContact] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [advancePayment, setAdvancePayment] = useState('');
  const [notes, setNotes] = useState('');

  const remaining = Math.max(0, (Number(totalAmount) || 0) - (Number(advancePayment) || 0));

  function submit(e){
    e.preventDefault();
    const total = Number(totalAmount) || 0;
    const advance = Number(advancePayment) || 0;
    if (advance > total){ showToast('Advance payment cannot be more than the total amount'); return; }
    const payload = {
      client: client.trim(), address: address.trim(), contact: contact.trim(),
      totalAmount: total, advancePayment: advance,
      notes: notes.trim(),
    };
    call('addNormalClient', payload).then(() => {
      onDone();
      showToast(payload.client + ' added');
      return refreshFromBackend();
    }).catch((err) => showToast('Failed: ' + err.message));
  }

  return (
    <div>
      <h2 style={{fontSize:'1.15rem'}}>Add a normal client</h2>
      <div className="page-sub">Just basic details — no Client ID, no API key, no billing cycle.</div>
      <DocumentAutofill clientType="normal" onFields={(f) => {
        if (f.clientName) setClient(f.clientName);
        if (f.address) setAddress(f.address);
        if (f.contact) setContact(f.contact);
        if (f.totalAmount != null) setTotalAmount(String(f.totalAmount));
        if (f.advancePayment != null) setAdvancePayment(String(f.advancePayment));
        if (f.notes) setNotes(f.notes);
      }} />
      <form id="add-normal-form" onSubmit={submit}>
        <div className="form-grid">
          <label className="full">Client name
            <input id="an-client" type="text" autoComplete="off" required maxLength={255} placeholder="e.g. Ravi Kumar" value={client} onChange={(e) => setClient(e.target.value)} />
          </label>
          <label className="full">Address
            <input id="an-address" type="text" autoComplete="off" maxLength={2000} placeholder="Address" value={address} onChange={(e) => setAddress(e.target.value)} />
          </label>
          <label className="full">Contact details
            <input id="an-contact" type="text" autoComplete="off" maxLength={255} placeholder="Phone / email" value={contact} onChange={(e) => setContact(e.target.value)} />
          </label>
          <label>Total amount (₹)
            <input id="an-total" type="number" min="0" step="0.01" value={totalAmount} onChange={(e) => setTotalAmount(e.target.value)} />
          </label>
          <label>Advance payment (₹)
            <input id="an-advance" type="number" min="0" step="0.01" max={totalAmount || undefined} value={advancePayment} onChange={(e) => setAdvancePayment(e.target.value)} />
          </label>
          <label className="full">Remaining payment (₹)
            <input type="text" disabled value={'₹' + remaining.toLocaleString('en-IN')} />
          </label>
          <label className="full">Other details
            <input id="an-notes" type="text" autoComplete="off" maxLength={2000} placeholder="Anything else worth noting" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
        </div>
        <div style={{display:'flex', justifyContent:'space-between', gap:'8px', marginTop:'18px'}}>
          <button type="button" className="btn btn-ghost" onClick={onBack}>Back</button>
          <div style={{display:'flex', gap:'8px'}}>
            <button id="an-cancel" type="button" className="btn btn-ghost" onClick={onDone}>Cancel</button>
            <button type="submit" className="btn btn-primary">Create client</button>
          </div>
        </div>
      </form>
    </div>
  );
}
