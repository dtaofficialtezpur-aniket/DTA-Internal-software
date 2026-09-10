import { useEffect, useState } from 'react';
import { useApp } from '../state/AppContext.jsx';

export default function AddClientModal(){
  const { addClientOpen, setAddClientOpen, settings, call, refreshFromBackend, showToast } = useApp();
  const [client, setClient] = useState('');
  const [software, setSoftware] = useState('');
  const [amount, setAmount] = useState('');
  const [cycle, setCycle] = useState('Monthly');
  const [start, setStart] = useState('');
  const [grace, setGrace] = useState(settings.grace);

  useEffect(() => {
    if (addClientOpen){
      setStart(new Date().toISOString().slice(0, 10));
      setGrace(settings.grace);
    }
  }, [addClientOpen, settings.grace]);

  function close(){
    setAddClientOpen(false);
    setClient(''); setSoftware(''); setAmount(''); setCycle('Monthly');
  }

  function submit(e){
    e.preventDefault();
    const payload = {
      client: client.trim(), software: software.trim(), cycle,
      amount: Number(amount) || 0, start, grace: Number(grace) || settings.grace,
    };
    call('add', payload).then(() => {
      close();
      showToast(payload.client + ' added');
      return refreshFromBackend();
    }).catch((err) => showToast('Failed: ' + err.message));
  }

  return (
    <div className={'modal-wrap' + (addClientOpen ? ' open' : '')}>
      <div className="modal">
        <h2 style={{fontSize:'1.15rem'}}>Add a client</h2>
        <div className="page-sub">Creates a Client ID and API key for a new DTA software deployment.</div>
        <form id="add-form" onSubmit={submit}>
          <div className="form-grid">
            <label className="full">Client company name
              <input id="a-client" type="text" required placeholder="e.g. Coastal Traders LLP" value={client} onChange={(e) => setClient(e.target.value)} />
            </label>
            <label className="full">Software name
              <input id="a-software" type="text" required placeholder="e.g. Coastal Billing" value={software} onChange={(e) => setSoftware(e.target.value)} />
            </label>
            <label>Plan amount (₹)
              <input id="a-amount" type="number" min="0" required placeholder="5000" value={amount} onChange={(e) => setAmount(e.target.value)} />
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
          <div style={{display:'flex', justifyContent:'flex-end', gap:'8px', marginTop:'18px'}}>
            <button id="a-cancel" type="button" className="btn btn-ghost" onClick={close}>Cancel</button>
            <button type="submit" className="btn btn-primary">Create client</button>
          </div>
        </form>
      </div>
    </div>
  );
}
