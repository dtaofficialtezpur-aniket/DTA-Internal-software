import { Suspense } from 'react';
import { CatalogView } from '@/components/views/Catalog';
import { SERVICES } from '@/lib/constants';
import type { Dept } from '@/lib/types';

export const dynamicParams = false;
export const generateStaticParams = () =>
  (['accounts', 'trading'] as const).flatMap((dept) => SERVICES[dept].map((s) => ({ dept, service: s.slug })));

export default async function Page({ params }: { params: Promise<{ dept: string; service: string }> }) {
  const { dept, service } = await params;
  return (
    <Suspense fallback={null}>
      <CatalogView dept={dept as Dept} slug={service} />
    </Suspense>
  );
}
