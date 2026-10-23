import { Suspense } from 'react';
import { DayBookView } from '@/components/views/DayBook';
import type { Dept } from '@/lib/types';

export default async function Page({ params }: { params: Promise<{ dept: string }> }) {
  const { dept } = await params;
  return (
    <Suspense fallback={null}>
      <DayBookView dept={dept as Dept} />
    </Suspense>
  );
}
