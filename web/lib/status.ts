import { diffDays } from './format';
import type { Client, ClientStatus } from './types';

export function computeStatus(c: Client, leadDays: number, today: Date): ClientStatus {
  if (c.status === 'paused') return 'paused';
  const d = diffDays(new Date(c.nextDue), today);
  if (d < 0) return 'overdue';
  if (d <= leadDays) return 'due';
  return 'active';
}

export const STATUS_META: Record<ClientStatus, { cls: string; label: string }> = {
  active: { cls: 'pill-active', label: 'Active' },
  due: { cls: 'pill-due', label: 'Due soon' },
  overdue: { cls: 'pill-overdue', label: 'Overdue' },
  paused: { cls: 'pill-paused', label: 'Paused' },
};

export function actionColor(action: string): string {
  if (action === 'paused') return 'var(--crit)';
  if (action === 'reminder') return 'var(--warn)';
  return 'var(--good)';
}
