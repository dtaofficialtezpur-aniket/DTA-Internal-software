export type ClientStatus = 'active' | 'due' | 'overdue' | 'paused';

export interface HistoryEvent {
  clientId: string;
  timestamp: string;
  action: string;
  note: string;
}

export interface Client {
  id: string;
  apiKey: string;
  client: string;
  software: string;
  cycle: 'Monthly' | 'Annual';
  amount: number;
  start: string;
  nextDue: string;
  grace: number;
  status: 'active' | 'paused';
  pausedAt: string;
  history: HistoryEvent[];
}

export interface Settings {
  agencyName: string;
  leadDays: number;
  defaultGrace: number;
}

export interface ListResponse {
  settings: Settings;
  clients: Client[];
}
