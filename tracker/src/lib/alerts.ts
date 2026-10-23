import { serviceLabel, servicesOf } from './constants';
import { accState } from './filings';
import { followUp } from './leads';
import { clientRoute, route } from './routes';
import type { AppData, Dept } from './types';

export interface Alert { title: string; sub: string; href: string }

/** Things that need attention in a department: overdue filings / renewals and follow-ups due. */
export function alertsFor(d: AppData, dept: Dept): Alert[] {
  const out: Alert[] = [];
  const names = servicesOf(dept).map((s) => s.name);
  for (const c of d.clients)
    if (c.type === dept && c.service && names.includes(c.service) && accState(c) === 'overdue')
      out.push({ title: c.name, sub: `${serviceLabel(c.service)} · overdue`, href: clientRoute(c) });
  for (const l of d.leads) {
    const f = followUp(l);
    if (l.dept === dept && (f === 'overdue' || f === 'today'))
      out.push({ title: l.name, sub: `Follow-up ${f === 'today' ? 'due today' : 'overdue'} · ${l.service}`, href: route(dept, 'crm', { q: l.name }) });
  }
  return out;
}
