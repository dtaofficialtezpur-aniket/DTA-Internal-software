import { Suspense } from 'react';
import { LedgersView } from '@/components/views/Ledgers';
import type { Dept } from '@/lib/types';

export default async function Page({ params }: { params: Promise<{ dept: string }> }) {
  const { dept } = await params;
  return (
    <Suspense fallback={null}>
      <LedgersView dept={dept as Dept} />
    </Suspense>
  );
}
