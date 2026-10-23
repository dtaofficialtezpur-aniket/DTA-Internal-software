import { servicesOf } from '@/lib/constants';
import { route } from '@/lib/routes';
import type { Dept } from '@/lib/types';

export interface NavLink { href: string; label: string; badge?: number }
export interface NavGroup { title: string; accent?: boolean; items: NavLink[] }
export type NavEntry = NavLink | NavGroup;
export const isGroup = (e: NavEntry): e is NavGroup => 'items' in e;

export function navFor(dept: Dept, deletedCount: number): NavEntry[] {
  const r = (p: string) => route(dept, p);
  const books: NavGroup = {
    title: 'Books of accounts', accent: true,
    items: [
      { href: r('vouchers'), label: 'Voucher Entry' }, { href: r('daybook'), label: 'Day Book' }, { href: r('ledgers'), label: 'Ledgers' },
      { href: r('trial-balance'), label: 'Trial Balance' }, { href: r('profit-loss'), label: 'Profit & Loss' }, { href: r('balance-sheet'), label: 'Balance Sheet' },
    ],
  };
  const base: NavLink[] = [{ href: r('dashboard'), label: 'Dashboard' }, { href: r('crm'), label: 'CRM / Leads' }];
  if (dept === 'marketing')
    return [...base, { href: r('clients'), label: 'Clients' }, books, { title: 'More', items: [{ href: r('portal'), label: 'Client Portal' }] }];
  return [
    ...base, books,
    { title: dept === 'accounts' ? 'Accounting & compliance' : 'Licenses & registrations', items: servicesOf(dept).map((s) => ({ href: r(`services/${s.slug}`), label: s.label })) },
    { title: 'More', items: [{ href: r('deleted'), label: 'Deleted', badge: deletedCount }, { href: r('portal'), label: 'Client Portal' }] },
  ];
}
