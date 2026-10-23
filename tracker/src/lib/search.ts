import { DEPT_LABEL, STAGES, serviceLabel } from './constants';
import { clientRoute, route } from './routes';
import type { AppData } from './types';

export interface SearchHit { kind: 'Client' | 'Lead' | 'Ledger'; title: string; sub: string; href: string }

export function searchAll(d: AppData, query: string): SearchHit[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const hits: SearchHit[] = [];
  for (const c of d.clients) {
    const hay = [c.name, c.businessName, c.serial, c.phone, c.regNo, c.detail, c.service].join(' ').toLowerCase();
    if (hay.includes(q)) hits.push({ kind: 'Client', title: c.name, sub: `${DEPT_LABEL[c.type]} · ${c.service ? serviceLabel(c.service) : 'Client'}`, href: clientRoute(c) });
  }
  for (const l of d.leads)
    if ((l.name + ' ' + l.phone).toLowerCase().includes(q))
      hits.push({ kind: 'Lead', title: l.name, sub: `${DEPT_LABEL[l.dept]} · ${l.service} · ${STAGES.find((s) => s[0] === l.stage)?.[1]}`, href: route(l.dept, 'crm', { q: l.name }) });
  for (const l of d.ledgers)
    if (l.name.toLowerCase().includes(q)) hits.push({ kind: 'Ledger', title: l.name, sub: `${DEPT_LABEL[l.dept]} · ${l.group}`, href: route(l.dept, 'ledgers', { id: l.id }) });
  return hits.slice(0, 10);
}
