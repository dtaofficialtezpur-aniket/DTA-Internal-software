import { PRODUCTS, STAGES } from '../constants.js';

export const StagePill = ({ stage }) => <span className={'pill stage-' + stage}>{STAGES[stage] || stage}</span>;
export const ProductTag = ({ type }) => <span className="tag">{PRODUCTS[type] || type}</span>;

export function Stat({ label, value, sub }){
  return <div className="card stat"><div className="stat-label">{label}</div><div className="stat-value tabular">{value}</div>{sub && <div className="stat-sub">{sub}</div>}</div>;
}

export function Modal({ title, onClose, children, wide }){
  return (
    <div className="modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={'card modal' + (wide ? ' wide' : '')} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head"><h2>{title}</h2><button className="btn ghost" onClick={onClose} aria-label="Close">✕</button></div>
        {children}
      </div>
    </div>
  );
}

// From/To dates plus quick presets.
export function RangeFilter({ range, onChange, presets }){
  return (
    <div className="filters">
      {presets.map(([key, label, r]) => (
        <button key={key} className={'chip' + (range.key === key ? ' on' : '')} onClick={() => onChange({ key, ...r })}>{label}</button>
      ))}
      <label className="inline">From <input type="date" value={range.from} onChange={(e) => onChange({ ...range, key: 'custom', from: e.target.value })} /></label>
      <label className="inline">To <input type="date" value={range.to} onChange={(e) => onChange({ ...range, key: 'custom', to: e.target.value })} /></label>
    </div>
  );
}
