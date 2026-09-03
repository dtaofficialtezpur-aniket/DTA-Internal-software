import type { ListResponse } from './types';

export interface BackendConn {
  backendUrl: string;
  adminKey: string;
}

export function hasBackend(conn: BackendConn): boolean {
  return !!(conn.backendUrl && conn.adminKey);
}

/**
 * Every admin action (list/add/pause/resume/markPaid/regenerateKey/
 * updateSettings) goes through this one call — same contract as the
 * dashboard/index.html sandbox and backend/google-apps-script/Code.gs.
 * Mirror any change to that HTML/Apps Script pair here too.
 */
export async function apiCall<T = unknown>(
  conn: BackendConn,
  action: string,
  payload: Record<string, unknown> = {}
): Promise<T> {
  if (!hasBackend(conn)) throw new Error('Backend not configured');
  const res = await fetch(conn.backendUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, adminKey: conn.adminKey, ...payload }),
  });
  const data = await res.json();
  if (data && data.error) throw new Error(data.error);
  return data as T;
}

export function fetchList(conn: BackendConn) {
  return apiCall<ListResponse>(conn, 'list');
}
