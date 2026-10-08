import { useCallback, useEffect, useState } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { PRODUCTS, STAGES } from '../constants.js';
import { fmtDate, fmtINR, isOverdue } from '../utils.js';
import { ProductTag, StagePill } from '../components/Bits.jsx';
import LeadModal from '../components/LeadModal.jsx';

export default function Leads({ initialUserId }){
  const { user, call, showToast } = useApp();
  const isAdmin = user.role === 'admin';
  const [filters, setFilters] = useState({ q: '', stage: '', productType: '', userId: initialUserId ? String(initialUserId) : '', dueOnly: false });
  const [team, setTeam] = useState([]);
  const [data, setData] = useState({ leads: [], total: 0 });
  const [open, setOpen] = useState(null); // null | 'new' | lead
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    call('listLeads', { ...filters, limit: 300 }).then(setData).catch((e) => showToast(e.message, 'err')).finally(() => setLoading(false));
  }, [call, filters, showToast]);

  useEffect(() => { const id = setTimeout(load, 200); return () => clearTimeout(id); }, [load]);
  useEffect(() => { if (isAdmin) call('listTeam').then((d) => setTeam(d.team)).catch(() => {}); }, [isAdmin, call]);

  const set = (k) => (e) => setFilters({ ...filters, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const del = (l) => { if (confirm(`Delete lead "${l.name}"?`)) call('deleteLead', { id: l.id }).then(() => { showToast('Lead deleted.'); load(); }).catch((e) => showToast(e.message, 'err')); };

  return (
    <div className="page">
      <header className="page-head"><h1>{isAdmin ? 'All leads' : 'My leads'} <span className="muted">({data.total})</span></h1>
        {!isAdmin && <button className="btn primary" onClick={() => setOpen('new')}>+ Add lead</button>}</header>

      <div className="filters">
        <input type="search" placeholder="Search name, phone, city…" value={filters.q} onChange={set('q')} />
        <select value={filters.stage} onChange={set('stage')}><option value="">All stages</option>{Object.entries(STAGES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <select value={filters.productType} onChange={set('productType')}><option value="">All products</option>{Object.entries(PRODUCTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        {isAdmin && <select value={filters.userId} onChange={set('userId')}><option value="">All employees</option>{team.map((t) => <option key={t.id} value={t.id}>{t.fullName} ({t.state})</option>)}</select>}
        <label className="inline"><input type="checkbox" checked={filters.dueOnly} onChange={set('dueOnly')} /> Follow-up due</label>
      </div>

      <div className="card table-wrap">
        <table className="table">
          <thead><tr><th>Lead</th>{isAdmin && <th>Employee</th>}<th>State</th><th>Product</th><th>Stage</th><th className="num">Value</th><th>Follow-up</th>{!isAdmin && <th />}</tr></thead>
          <tbody>
            {data.leads.map((l) => (
              <tr key={l.id}>
                <td><button className="link" onClick={() => setOpen(l)}>{l.name}</button>{l.phone && <div className="muted small">{l.phone}</div>}</td>
                {isAdmin && <td>{l.employee}</td>}
                <td>{l.state}{l.city && <div className="muted small">{l.city}</div>}</td>
                <td><ProductTag type={l.productType} />{l.productName && <div className="muted small">{l.productName}</div>}</td>
                <td><StagePill stage={l.stage} /></td>
                <td className="num">{fmtINR(l.stage === 'won' ? l.dealValue : l.estValue)}</td>
                <td className={isOverdue(l.nextFollowup, l.stage) ? 'overdue' : ''}>{fmtDate(l.nextFollowup)}</td>
                {!isAdmin && <td className="num"><button className="link danger" onClick={() => del(l)}>Delete</button></td>}
              </tr>
            ))}
            {!loading && !data.leads.length && <tr><td colSpan="8" className="muted">{isAdmin ? 'No leads match.' : 'No leads yet — add your first one.'}</td></tr>}
          </tbody>
        </table>
      </div>

      {open && <LeadModal lead={open === 'new' ? null : open} readOnly={isAdmin} onClose={() => setOpen(null)}
        onSaved={(keepOpen) => { if (keepOpen !== true) setOpen(null); load(); }} />}
    </div>
  );
}
