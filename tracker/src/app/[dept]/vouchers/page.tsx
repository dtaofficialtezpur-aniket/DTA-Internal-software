import { Suspense } from 'react';
import { VoucherEntryView } from '@/components/views/VoucherEntry';
import type { Dept } from '@/lib/types';

export default async function Page({ params }: { params: Promise<{ dept: string }> }) {
  const { dept } = await params;
  return (
    <Suspense fallback={null}>
      <VoucherEntryView dept={dept as Dept} />
    </Suspense>
  );
}
