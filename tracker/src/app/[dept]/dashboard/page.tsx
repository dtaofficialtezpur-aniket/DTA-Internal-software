import { Suspense } from 'react';
import { DashboardView } from '@/components/views/Dashboard';
import type { Dept } from '@/lib/types';

export default async function Page({ params }: { params: Promise<{ dept: string }> }) {
  const { dept } = await params;
  return (
    <Suspense fallback={null}>
      <DashboardView dept={dept as Dept} />
    </Suspense>
  );
}
