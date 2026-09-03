import { STATUS_META } from '@/lib/status';
import type { ClientStatus } from '@/lib/types';

export function Pill({ status }: { status: ClientStatus }) {
  const m = STATUS_META[status];
  return <span className={'pill ' + m.cls}>{m.label}</span>;
}
