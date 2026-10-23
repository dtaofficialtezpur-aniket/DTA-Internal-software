import { Suspense } from 'react';
import { MarketingClientsView } from '@/components/views/MarketingClients';

export const generateStaticParams = () => [{ dept: 'marketing' }];

export default function Page() {
  return (
    <Suspense fallback={null}>
      <MarketingClientsView />
    </Suspense>
  );
}
