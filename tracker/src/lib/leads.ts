import type { Lead } from './types';
import { today } from './utils';

export type FollowUp = '' | 'overdue' | 'today' | 'upcoming';
export function followUp(l: Lead): FollowUp {
  if (l.stage === 'won' || l.stage === 'lost' || !l.next) return '';
  const t = today();
  return l.next < t ? 'overdue' : l.next === t ? 'today' : 'upcoming';
}
