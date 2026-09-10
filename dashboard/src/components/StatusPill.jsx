import { STATUS_META } from '../utils.js';

export default function StatusPill({ status }){
  const m = STATUS_META[status];
  return <span className={'pill ' + m.cls}>{m.label}</span>;
}

const TEAM_LABELS = { active: 'Active', removed: 'Removed' };
export function TeamStatusPill({ status }){
  return <span className={'pill pill-' + status}>{TEAM_LABELS[status] || status}</span>;
}
