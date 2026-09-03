import type { View } from '@/lib/hooks/useDashboard';

export function NoBackendBanner({ show, onOpenSettings }: { show: boolean; onOpenSettings: (v: View) => void }) {
  if (!show) return null;
  return (
    <div className="banner">
      <span>
        No backend connected yet — go to <b>Settings</b> and paste your Google Apps Script Web App URL + admin key to load real
        client data.
      </span>
      <button className="btn btn-secondary btn-sm" onClick={() => onOpenSettings('settings')}>
        Open Settings
      </button>
    </div>
  );
}
