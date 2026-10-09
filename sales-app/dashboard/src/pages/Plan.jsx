import { useState } from 'react';
import PdfViewer from '../components/PdfViewer.jsx';
import onlinePlan from '../assets/plans/online-sales-plan.pdf?b64';
import howToSell from '../assets/plans/how-to-sell-dta.pdf?b64';

// The official sales plans are built into the app, so every employee always reads the same, current version.
const PLANS = [
  { id: 'online', label: 'Online Sales Plan', file: 'DTA-Online-Sales-Plan.pdf', data: onlinePlan, blurb: 'How to collect leads online, answer enquiries, run online demos and close clients.' },
  { id: 'howto', label: 'How to Sell DTA', file: 'DTA-How-To-Sell.pdf', data: howToSell, blurb: 'How to communicate, deal with customers and help them see why they need DTA.' },
];

export default function Plan(){
  const [id, setId] = useState('online');
  const plan = PLANS.find((p) => p.id === id);
  return (
    <div className="page">
      <header className="page-head"><h1>Sales plan</h1></header>
      <p className="muted" style={{ margin: 0 }}>The official DTA sales plan. Read it fully and follow it in every customer conversation.</p>
      <div className="filters">
        {PLANS.map((p) => <button key={p.id} className={'chip' + (id === p.id ? ' on' : '')} onClick={() => setId(p.id)}>{p.label}</button>)}
      </div>
      <p className="small muted" style={{ margin: 0 }}>{plan.blurb}</p>
      <PdfViewer key={plan.id} base64={plan.data} filename={plan.file} />
    </div>
  );
}
