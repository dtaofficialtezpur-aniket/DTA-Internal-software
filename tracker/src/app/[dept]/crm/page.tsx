import { Suspense } from 'react';
import { CrmView } from '@/components/views/Crm';
import type { Dept } from '@/lib/types';

export default async function Page({ params }: { params: Promise<{ dept: string }> }) {
  const { dept } = await params;
  return (
    <Suspense fallback={null}>
      <CrmView dept={dept as Dept} />
    </Suspense>
  );
}
