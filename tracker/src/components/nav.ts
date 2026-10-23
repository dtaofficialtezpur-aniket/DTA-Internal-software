import {
  BadgeCheck, BookOpen, BookOpenCheck, BookText, Briefcase, Calculator, ClipboardCheck, ClipboardList, Coins, Ellipsis, FileText, Globe,
  HeartPulse, IdCard, Landmark, LayoutDashboard, NotebookPen, PenLine, PiggyBank, Receipt, Scale, Shapes, ShieldCheck, Store, Trash2,
  TrendingUp, Users, UsersRound, type LucideIcon,
} from 'lucide-react';
import { servicesOf } from '@/lib/constants';
import { route } from '@/lib/routes';
import type { Dept } from '@/lib/types';

export interface NavLink { href: string; label: string; icon: LucideIcon; badge?: number }
export interface NavGroup { title: string; icon: LucideIcon; accent?: boolean; items: NavLink[] }
export type NavEntry = NavLink | NavGroup;
export const isGroup = (e: NavEntry): e is NavGroup => 'items' in e;

/** One icon per service catalog (keyed by the service slug). */
const SERVICE_ICON: Record<string, LucideIcon> = {
  gst: Receipt, itr: FileText, tds: Coins, pan: IdCard, 'provident-fund': PiggyBank, esi: HeartPulse, 'professional-tax': Briefcase,
  'accounting-bookkeeping': Calculator, audit: ClipboardCheck, other: Shapes,
  'trade-license': Store, 'fssai-license': ShieldCheck, 'digital-signature': PenLine,
};

export function navFor(dept: Dept, deletedCount: number): NavEntry[] {
  const r = (p: string) => route(dept, p);
  const books: NavGroup = {
    title: 'Books of accounts', icon: BookOpenCheck, accent: true,
    items: [
      { href: r('vouchers'), label: 'Voucher Entry', icon: NotebookPen },
      { href: r('daybook'), label: 'Day Book', icon: BookOpen },
      { href: r('ledgers'), label: 'Ledgers', icon: BookText },
      { href: r('trial-balance'), label: 'Trial Balance', icon: Scale },
      { href: r('profit-loss'), label: 'Profit & Loss', icon: TrendingUp },
      { href: r('balance-sheet'), label: 'Balance Sheet', icon: Landmark },
    ],
  };
  const base: NavLink[] = [
    { href: r('dashboard'), label: 'Dashboard', icon: LayoutDashboard },
    { href: r('crm'), label: 'CRM / Leads', icon: Users },
  ];
  const portal: NavLink = { href: r('portal'), label: 'Client Portal', icon: Globe };
  if (dept === 'marketing')
    return [...base, { href: r('clients'), label: 'Clients', icon: UsersRound }, books, { title: 'More', icon: Ellipsis, items: [portal] }];
  return [
    ...base, books,
    {
      title: dept === 'accounts' ? 'Accounting & compliance' : 'Licenses & registrations',
      icon: dept === 'accounts' ? ClipboardList : BadgeCheck,
      items: servicesOf(dept).map((s) => ({ href: r(`services/${s.slug}`), label: s.label, icon: SERVICE_ICON[s.slug] ?? Shapes })),
    },
    { title: 'More', icon: Ellipsis, items: [{ href: r('deleted'), label: 'Deleted', icon: Trash2, badge: deletedCount }, portal] },
  ];
}
