export type Dept = 'accounts' | 'marketing' | 'trading';
export type ClientStatus = 'Active' | 'Pending' | 'Completed' | 'On Hold';
export type FilingValue = 'Filed' | 'Pending' | 'N/A';
export type PayValue = 'Paid' | 'Unpaid';

export interface GstMonth { gstr1?: string; gstr3b?: string; payment?: string }
export interface ItrYear { filed?: string; payment?: string }
export interface TdsQuarter { ret?: string; fee?: string }
export interface PanApp {
  type?: string; ack?: string; applied?: string; status?: string; delivered?: string; payment?: string;
}

/** A client record. Digital Marketing clients and service-catalog clients (Accounts / Trading) share this shape. */
export interface Client {
  id: number;
  type: Dept;
  name: string;
  service?: string;
  status: string;
  // Digital Marketing
  fee?: number;
  due?: string;
  // Service catalogs (Accounts / Trading)
  serial?: string;
  businessName?: string;
  detail?: string;
  regNo?: string;
  dateGiven?: string;
  loginId?: string;
  password?: string;
  dueDate?: string;
  phone?: string;
  email?: string;
  notes?: string;
  pay?: string;
  lastUpdated?: string;
  deletedAt?: string;
  // Filing tracking
  gstFiling?: Record<string, GstMonth>;
  itrFiling?: Record<string, ItrYear>;
  tdsFiling?: Record<string, { pay?: string }>;
  tdsQtr?: Record<string, TdsQuarter>;
  panApp?: PanApp;
}

export type LeadStage = 'new' | 'contacted' | 'proposal' | 'won' | 'lost';
export interface Lead {
  id: number;
  dept: Dept;
  name: string;
  phone: string;
  source: string;
  service: string;
  value: number;
  stage: LeadStage;
  next: string;
  notes: { d: string; t: string }[];
  cid: number | null;
  wonOn?: string;
}

export interface Ledger { id: number; dept: Dept; name: string; group: string; open: number }
export interface VLine { l: number; dr: number; cr: number }
export type VoucherType = 'Contra' | 'Payment' | 'Receipt' | 'Journal' | 'Sales' | 'Purchase';
export interface Voucher {
  id: number; dept: Dept; type: VoucherType; no: number; date: string; narr: string; lines: VLine[];
}

export type ActivityKind = 'Voucher' | 'Filing' | 'Client' | 'Lead';
export interface Activity { id: number; dept: Dept; d: string; t: string; k: ActivityKind; x: string }

export interface AppData {
  clients: Client[];
  leads: Lead[];
  deleted: Client[];
  ledgers: Ledger[];
  vouchers: Voucher[];
  activity: Activity[];
  /** next free id (shared by every record type) */
  seq: number;
  settings: { gstTogether: boolean };
}

export type PillTone = 'filed' | 'paid' | 'active' | 'pending' | 'paused' | 'overdue' | 'unpaid' | 'na' | 'today' | 'upcoming';
