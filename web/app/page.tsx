'use client';

import { AddClientModal } from '@/components/AddClientModal';
import { ClientDetailPanel } from '@/components/ClientDetailPanel';
import { NoBackendBanner } from '@/components/NoBackendBanner';
import { Sidebar } from '@/components/Sidebar';
import { Toast } from '@/components/Toast';
import { ActivityView } from '@/components/views/ActivityView';
import { ClientsView } from '@/components/views/ClientsView';
import { OverviewView } from '@/components/views/OverviewView';
import { SettingsView } from '@/components/views/SettingsView';
import { useDashboard } from '@/lib/hooks/useDashboard';

export default function Page() {
  const d = useDashboard();

  function handlePauseClick(id: string, clientName: string) {
    if (d.pauseConfirm) {
      d.runAction('pause', { id }, clientName + ' paused');
      d.setPauseConfirm(false);
    } else {
      d.setPauseConfirm(true);
    }
  }

  function handleCopyKey(key: string) {
    navigator.clipboard.writeText(key).then(
      () => d.setToast('API key copied'),
      () => d.setToast('Could not copy — select the key manually')
    );
  }

  return (
    <div className="app">
      <Sidebar view={d.view} setView={d.setView} connected={d.connected} connectedToBackend={d.connectedToBackend} />

      <main className="main">
        <div className="main-inner">
          <NoBackendBanner show={!d.connectedToBackend} onOpenSettings={d.setView} />

          {d.view === 'overview' && (
            <OverviewView
              today={d.today}
              connectedToBackend={d.connectedToBackend}
              clientCount={d.clients.length}
              counts={d.counts}
              mrr={d.mrr}
              rows={d.rowsNeedingAttention}
              onAddClient={d.requireBackendThenOpenAdd}
              onView={d.openDetail}
            />
          )}

          {d.view === 'clients' && (
            <ClientsView
              connectedToBackend={d.connectedToBackend}
              rows={d.filteredClients}
              search={d.search}
              onSearchChange={d.setSearch}
              statusFilter={d.statusFilter}
              onStatusFilterChange={d.setStatusFilter}
              onAddClient={d.requireBackendThenOpenAdd}
              onView={d.openDetail}
            />
          )}

          {d.view === 'activity' && <ActivityView connectedToBackend={d.connectedToBackend} events={d.allHistory} />}

          {d.view === 'settings' && (
            <SettingsView
              key={`${d.conn.backendUrl}|${d.conn.adminKey}|${d.settings.agencyName}|${d.settings.leadDays}|${d.settings.defaultGrace}`}
              conn={d.conn}
              connected={d.connected}
              settings={d.settings}
              onSaveConn={d.saveConn}
              onTestConnection={d.testConnection}
              onSaveSettings={(payload) => d.runAction('updateSettings', payload, 'Settings saved')}
            />
          )}
        </div>
      </main>

      <div
        className={'backdrop' + (d.selectedId || d.addOpen ? ' open' : '')}
        onClick={() => {
          d.closeDetail();
          d.setAddOpen(false);
        }}
      />

      <ClientDetailPanel
        client={d.selected}
        open={!!d.selectedId}
        leadDays={d.settings.leadDays}
        today={d.today}
        revealKey={d.revealKey}
        onToggleReveal={() => d.setRevealKey((r) => !r)}
        pauseConfirm={d.pauseConfirm}
        onClose={d.closeDetail}
        onCopyKey={handleCopyKey}
        onRegenerateKey={(id, name) => d.runAction('regenerateKey', { id }, 'API key regenerated for ' + name)}
        onMarkPaid={(id, name) => d.runAction('markPaid', { id }, 'Payment recorded for ' + name)}
        onPause={handlePauseClick}
        onResume={(id, name) => d.runAction('resume', { id }, name + ' resumed')}
      />

      {d.addOpen && <AddClientModal defaultGrace={d.settings.defaultGrace} onCancel={() => d.setAddOpen(false)} onCreate={d.createClient} />}

      <Toast message={d.toast} />
    </div>
  );
}
