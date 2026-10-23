import { Suspense } from 'react';
import { TrialBalanceView } from '@/components/views/Reports';
import type { Dept } from '@/lib/types';

export default async function Page({ params }: { params: Promise<{ dept: string }> }) {
  const { dept } = await params;
  return (
    <Suspense fallback={null}>
      <TrialBalanceView dept={dept as Dept} />
    </Suspense>
  );
}
