import type { Activity, PillTone } from '@/lib/types';
import { fmtD } from '@/lib/utils';
import { Pill } from '../ui';

const KIND_TONE: Record<string, PillTone> = { Voucher: 'today', Filing: 'filed', Client: 'active', Lead: 'pending' };

/** A dated activity log. `asc` = oldest first (used for a single day). */
export function ActivityList({ items, limit, asc }: { items: Activity[]; limit: number; asc?: boolean }) {
  const sorted = [...items].sort((a, b) => (asc ? 1 : -1) * (a.d.localeCompare(b.d) || a.t.localeCompare(b.t) || a.id - b.id));
  const shown = sorted.slice(0, limit);
  if (!shown.length) return <p className="text-sm text-mute">Nothing recorded for this period.</p>;
  let last = '';
  return (
    <div>
      {shown.map((a) => {
        const head = !asc && a.d !== last ? ((last = a.d), <div className="mb-1 mt-3.5 text-[13px] font-extrabold text-brand-dark first:mt-0">{fmtD(a.d)}</div>) : null;
        return (
          <div key={a.id}>
            {head}
            <div className="flex items-center gap-2.5 border-t border-line py-1.5">
              <span className="w-[72px] shrink-0 text-center"><Pill tone={KIND_TONE[a.k] ?? 'na'}>{a.k}</Pill></span>
              <span className="flex-1">{a.x}</span>
              <small className="text-mute">{a.t}</small>
            </div>
          </div>
        );
      })}
      {sorted.length > limit && <p className="mt-2 text-sm text-mute">Showing latest {limit} of {sorted.length}</p>}
    </div>
  );
}
