import { Suspense } from 'react';
import { PortalView } from '@/components/views/Portal';
import type { Dept } from '@/lib/types';

export default async function Page({ params }: { params: Promise<{ dept: string }> }) {
  const { dept } = await params;
  return (
    <Suspense fallback={null}>
      <PortalView dept={dept as Dept} />
    </Suspense>
  );
}
