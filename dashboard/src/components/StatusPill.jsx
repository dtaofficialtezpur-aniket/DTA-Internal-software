import { STATUS_META, WORK_STATUSES } from '../utils.js';

export default function StatusPill({ status }){
  const m = STATUS_META[status];
  return <span className={'pill ' + m.cls}>{m.label}</span>;
}

const TEAM_LABELS = { active: 'Active', removed: 'Removed' };
export function TeamStatusPill({ status }){
  return <span className={'pill pill-' + status}>{TEAM_LABELS[status] || status}</span>;
}

export function WorkStatusPill({ status }){
  const m = WORK_STATUSES.find((w) => w.key === status);
  return m ? <span className={'pill ' + m.cls}>{m.label}</span> : <span style={{color:'var(--ink-faint)'}}>—</span>;
}
