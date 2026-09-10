import { useEffect, useState } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { actionColor, computeStatus, fmtDate, fmtDateTime, fmtMoney, maskKey } from '../utils.js';
import StatusPill from './StatusPill.jsx';

export default function ClientDetailPanel(){
  const { clients, settings, selectedClientId, setSelectedClientId, call, refreshFromBackend, showToast } = useApp();
  const [revealed, setRevealed] = useState(false);
  const [confirmPause, setConfirmPause] = useState(false);

  useEffect(() => { setRevealed(false); setConfirmPause(false); }, [selectedClientId]);

  const open = !!selectedClientId;
  const c = clients.find((x) => x.id === selectedClientId);

  function act(action, payload, successMsg){
    return call(action, { id: c.id, ...payload }).then(() => {
      showToast(successMsg);
      return refreshFromBackend();
    }).catch((err) => showToast('Failed: ' + err.message));
  }

  function copyKey(){
    try { navigator.clipboard.writeText(c.apiKey); showToast('API key copied'); }
    catch { showToast('Could not copy — select the key manually'); }
  }

  const s = c ? computeStatus(c, settings.lead) : null;

  return (
    <aside className={'panel' + (open ? ' open' : '')} aria-label="Client detail">
      {c && (
        <>
          <div className="panel-head">
            <div>
              <div style={{fontSize:'.72rem', color:'var(--ink-faint)', fontWeight:700, textTransform:'uppercase', letterSpacing:'.05em'}}>{c.id}</div>
              <h2 style={{fontSize:'1.1rem', marginTop:'2px'}}>{c.client}</h2>
              <div className="page-sub" style={{marginTop:'2px'}}>{c.software}</div>
            </div>
            <button id="d-close" className="btn btn-ghost btn-sm" aria-label="Close" onClick={() => setSelectedClientId(null)}>
              <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2"><path d="m5 5 10 10M15 5 5 15"/></svg>
            </button>
          </div>
          <div className="panel-body">
            <div id="d-status-pill"><StatusPill status={s} /></div>

            <div>
              <div className="field-row"><span>Plan</span><span className="tabular">{fmtMoney(c.amount)} / {c.cycle === 'Monthly' ? 'month' : 'year'}</span></div>
              <div className="field-row"><span>Started</span><span>{fmtDate(c.start)}</span></div>
              <div className="field-row"><span>Next due</span><span>{fmtDate(c.nextDue)}</span></div>
              <div className="field-row"><span>Grace period</span><span>{c.grace} days</span></div>
            </div>

            <div>
              <div style={{fontSize:'.78rem', fontWeight:700, color:'var(--ink-muted)', marginBottom:'6px'}}>Client ID</div>
              <div className="key-box"><code>{c.id}</code></div>
              <div style={{fontSize:'.78rem', fontWeight:700, color:'var(--ink-muted)', margin:'12px 0 6px'}}>API key</div>
              <div className="key-box">
                <code>{revealed ? c.apiKey : maskKey(c.apiKey)}</code>
                <button id="d-reveal" className="btn btn-ghost btn-sm" type="button" onClick={() => setRevealed(!revealed)}>{revealed ? 'Hide' : 'Reveal'}</button>
                <button id="d-copy" className="btn btn-ghost btn-sm" type="button" onClick={copyKey}>Copy</button>
              </div>
              <button id="d-regen" className="btn btn-ghost btn-sm" type="button" style={{marginTop:'8px'}} onClick={() => act('regenerateKey', {}, 'API key regenerated for ' + c.client)}>Regenerate API key</button>
            </div>

            <div style={{display:'flex', gap:'8px', flexWrap:'wrap'}}>
              <button id="d-markpaid" className="btn btn-secondary btn-sm" type="button" onClick={() => act('markPaid', {}, 'Payment recorded for ' + c.client)}>Mark as paid</button>
              {s === 'paused'
                ? <button id="d-resume" className="btn btn-secondary btn-sm" type="button" onClick={() => act('resume', {}, c.client + ' resumed')}>Resume access</button>
                : <button id="d-pause" className="btn btn-danger btn-sm" type="button" onClick={() => {
                    if (confirmPause) act('pause', {}, c.client + ' paused');
                    else setConfirmPause(true);
                  }}>{confirmPause ? 'Click again to confirm' : 'Pause access'}</button>}
            </div>

            <div>
              <div style={{fontSize:'.78rem', fontWeight:700, color:'var(--ink-muted)', marginBottom:'8px'}}>History</div>
              <div className="log-list">
                {c.history.slice().sort((a, b) => b.t - a.t).map((h, i) => (
                  <div className="log-row" key={i}>
                    <div className="log-dot" style={{background: actionColor(h.action)}} />
                    <div><div className="log-text">{h.note}</div><div className="log-time">{fmtDateTime(h.t)}</div></div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </aside>
  );
}
