import { Suspense } from 'react';
import { DeletedView } from '@/components/views/Deleted';
import type { Dept } from '@/lib/types';

export const generateStaticParams = () => [{ dept: 'accounts' }, { dept: 'trading' }];

export default async function Page({ params }: { params: Promise<{ dept: string }> }) {
  const { dept } = await params;
  return (
    <Suspense fallback={null}>
      <DeletedView dept={dept as Dept} />
    </Suspense>
  );
}
