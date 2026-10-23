import type { Dept } from './types';
import { serviceByName } from './constants';
import type { Client } from './types';

export const route = (dept: Dept, path: string, query?: Record<string, string | number | undefined>) => {
  const q = query
    ? '?' + Object.entries(query).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&')
    : '';
  return `/${dept}/${path}${path ? '/' : ''}${q === '?' ? '' : q}`;
};

/** Where a client lives in the app. */
export function clientRoute(c: Client) {
  const s = serviceByName(c.type, c.service);
  return s ? route(c.type, `services/${s.slug}`, { q: c.name }) : route(c.type, 'clients', { q: c.name });
}
