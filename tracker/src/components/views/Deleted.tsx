'use client';
import { DEPT_LABEL, serviceLabel } from '@/lib/constants';
import { purgeClient, restoreClient } from '@/lib/actions';
import { useData } from '@/lib/store';
import type { Dept } from '@/lib/types';
import { Empty, PageHeader } from '../ui';
import { useToast } from '../Providers';

export function DeletedView({ dept }: { dept: Dept }) {
  const d = useData();
  const toast = useToast();
  const list = d.deleted.filter((c) => c.type === dept);
  return (
    <>
      <PageHeader title={`${DEPT_LABEL[dept]} · Deleted clients`} sub="Deleted clients aren't erased. Restore them here, or delete forever if you're sure." />
      <div className="card overflow-x-auto">
        {!list.length ? <Empty title="Nothing deleted" hint="Clients you delete are kept here so you can restore them." /> : (
          <table className="tbl">
            <thead><tr><th>Client</th><th>Service</th><th>Phone</th><th>Deleted on</th><th /></tr></thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.id}>
                  <td><b>{c.name}</b></td><td>{serviceLabel(c.service)}</td><td>{c.phone || '—'}</td><td>{(c.deletedAt ?? '').slice(0, 10)}</td>
                  <td className="whitespace-nowrap">
                    <button className="btn-sec btn-xs" onClick={() => { restoreClient(c.id); toast('Client restored'); }}>Restore</button>{' '}
                    <button className="btn-sec btn-xs" onClick={() => { if (confirm('Delete forever? This cannot be undone.')) purgeClient(c.id); }}>Delete forever</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
