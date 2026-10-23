import { Suspense } from 'react';
import { ProfitLossView } from '@/components/views/Reports';
import type { Dept } from '@/lib/types';

export default async function Page({ params }: { params: Promise<{ dept: string }> }) {
  const { dept } = await params;
  return (
    <Suspense fallback={null}>
      <ProfitLossView dept={dept as Dept} />
    </Suspense>
  );
}
