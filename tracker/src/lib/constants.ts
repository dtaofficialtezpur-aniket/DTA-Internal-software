import type { Dept, LeadStage, VoucherType } from './types';

export const DEPTS: Dept[] = ['accounts', 'marketing', 'trading'];
export const DEPT_LABEL: Record<Dept, string> = {
  accounts: 'Accounts',
  marketing: 'Digital Marketing',
  trading: 'Trading',
};
export const isDept = (v: string): v is Dept => (DEPTS as string[]).includes(v);

export type ServiceKind = 'gst' | 'itr' | 'tds' | 'pan' | 'generic';
export interface ServiceDef {
  /** stored in client.service (kept identical to earlier versions so backups restore) */
  name: string;
  slug: string;
  label: string;
  prefix: string;
  kind: ServiceKind;
  portalUrl?: string;
}

export const SERVICES: Record<'accounts' | 'trading', ServiceDef[]> = {
  accounts: [
    { name: 'GST', slug: 'gst', label: 'GST', prefix: 'G', kind: 'gst', portalUrl: 'https://www.gst.gov.in/' },
    { name: 'ITR', slug: 'itr', label: 'ITR', prefix: 'I', kind: 'itr', portalUrl: 'https://www.incometax.gov.in/iec/foportal/' },
    { name: 'TDS', slug: 'tds', label: 'TDS', prefix: 'T', kind: 'tds' },
    { name: 'PAN', slug: 'pan', label: 'PAN', prefix: 'P', kind: 'pan' },
    { name: 'PROVIDENT FUND', slug: 'provident-fund', label: 'Provident Fund', prefix: 'PF', kind: 'generic' },
    { name: 'ESI', slug: 'esi', label: 'ESI', prefix: 'ES', kind: 'generic' },
    { name: 'Professional Tax', slug: 'professional-tax', label: 'Professional Tax', prefix: 'PT', kind: 'generic' },
    { name: 'Accounting & Bookkeeping', slug: 'accounting-bookkeeping', label: 'Accounting & Bookkeeping', prefix: 'AB', kind: 'generic' },
    { name: 'Audit', slug: 'audit', label: 'Audit', prefix: 'AU', kind: 'generic' },
    { name: 'Other', slug: 'other', label: 'Other', prefix: 'O', kind: 'generic' },
  ],
  trading: [
    { name: 'Trade License', slug: 'trade-license', label: 'Trade License', prefix: 'TL', kind: 'generic' },
    { name: 'FSSAI License', slug: 'fssai-license', label: 'FSSAI License', prefix: 'FS', kind: 'generic' },
    { name: 'Digital Signature (DSC)', slug: 'digital-signature', label: 'Digital Signature (DSC)', prefix: 'DS', kind: 'generic' },
  ],
};

export const servicesOf = (dept: Dept): ServiceDef[] =>
  dept === 'marketing' ? [] : SERVICES[dept];
export const serviceByName = (dept: Dept, name?: string) =>
  servicesOf(dept).find((s) => s.name === name);
export const serviceBySlug = (dept: Dept, slug: string) =>
  servicesOf(dept).find((s) => s.slug === slug);
export const serviceLabel = (name?: string) => {
  for (const d of ['accounts', 'trading'] as const) {
    const s = SERVICES[d].find((x) => x.name === name);
    if (s) return s.label;
  }
  return name ?? '';
};

/** Lead services per department */
export const LEAD_SERVICES: Record<Dept, string[]> = {
  accounts: SERVICES.accounts.map((s) => s.name),
  trading: SERVICES.trading.map((s) => s.name),
  marketing: [
    'Social media marketing', 'SEO', 'Google / Meta Ads', 'Content & graphic design',
    'Branding & logo', 'Video editing', 'WhatsApp / Email marketing', 'Google My Business',
  ],
};

export const CLIENT_STATUSES = ['Active', 'Pending', 'Completed', 'On Hold'] as const;
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export const STAGES: [LeadStage, string][] = [
  ['new', 'New'], ['contacted', 'Contacted'], ['proposal', 'Proposal sent'], ['won', 'Won'], ['lost', 'Lost'],
];
export const LEAD_SOURCES = ['Website', 'Referral', 'Phone call', 'WhatsApp', 'Walk-in', 'Social media'];
export const PAN_STATUSES = ['Not started', 'Applied', 'In process', 'Dispatched', 'Delivered'];
export const PAN_TYPES = ['New PAN', 'Correction', 'Reprint', 'Aadhaar link', 'Other'];

// ---------- books of accounts (Tally-style groups) ----------
export type Nature = 'L' | 'A' | 'I' | 'E';
export const GROUP_NATURE: Record<string, Nature> = {
  'Capital Account': 'L', 'Loans (Liability)': 'L', 'Current Liabilities': 'L', 'Sundry Creditors': 'L', 'Duties & Taxes': 'L',
  'Fixed Assets': 'A', 'Current Assets': 'A', 'Bank Accounts': 'A', 'Cash-in-hand': 'A', 'Sundry Debtors': 'A',
  'Sales Accounts': 'I', 'Direct Incomes': 'I', 'Indirect Incomes': 'I',
  'Purchase Accounts': 'E', 'Direct Expenses': 'E', 'Indirect Expenses': 'E',
};
export const GROUPS = Object.keys(GROUP_NATURE);
export const LIABILITY_GROUPS = ['Capital Account', 'Loans (Liability)', 'Current Liabilities', 'Sundry Creditors', 'Duties & Taxes'];
export const ASSET_GROUPS = ['Fixed Assets', 'Current Assets', 'Bank Accounts', 'Cash-in-hand', 'Sundry Debtors'];
export const INCOME_GROUPS = ['Sales Accounts', 'Direct Incomes', 'Indirect Incomes'];
export const EXPENSE_GROUPS = ['Purchase Accounts', 'Direct Expenses', 'Indirect Expenses'];

export const VOUCHER_TYPES: { type: VoucherType; key: string }[] = [
  { type: 'Contra', key: 'F4' }, { type: 'Payment', key: 'F5' }, { type: 'Receipt', key: 'F6' },
  { type: 'Journal', key: 'F7' }, { type: 'Sales', key: 'F8' }, { type: 'Purchase', key: 'F9' },
];

/** Optional starter ledgers a user can add with one click (never added automatically). */
export const STARTER_LEDGERS: Record<Dept, [string, string][]> = {
  accounts: [
    ['SBI Bank A/c', 'Bank Accounts'], ['Capital Account', 'Capital Account'], ['Professional Fees', 'Direct Incomes'],
    ['Other Income', 'Indirect Incomes'], ['Office Rent', 'Indirect Expenses'], ['Staff Salaries', 'Indirect Expenses'],
    ['Internet & Software', 'Indirect Expenses'], ['GST Payable', 'Duties & Taxes'],
  ],
  marketing: [
    ['SBI Bank A/c', 'Bank Accounts'], ['Capital Account', 'Capital Account'], ['Retainer Income', 'Sales Accounts'],
    ['Ad Credits (Meta / Google)', 'Direct Expenses'], ['Freelancer Charges', 'Direct Expenses'], ['Software Subscriptions', 'Indirect Expenses'],
  ],
  trading: [
    ['SBI Bank A/c', 'Bank Accounts'], ['Capital Account', 'Capital Account'], ['License Fees', 'Sales Accounts'],
    ['Govt. Fees Paid', 'Direct Expenses'], ['Office Expenses', 'Indirect Expenses'],
  ],
};
