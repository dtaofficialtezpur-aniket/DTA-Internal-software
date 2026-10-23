import type { MetadataRoute } from 'next';
import { asset } from '@/lib/asset';

export const dynamic = 'force-static';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'DTA Client Data Tracker',
    short_name: 'DTA Tracker',
    description: 'Accounts, digital marketing and trading clients with Tally-style books. Works offline.',
    id: asset('/'),
    start_url: asset('/accounts/dashboard/'),
    scope: asset('/'),
    display: 'standalone',
    orientation: 'any',
    background_color: '#ffffff',
    theme_color: '#2f5bea',
    categories: ['business', 'finance', 'productivity'],
    icons: [
      { src: asset('/icons/icon-192.png'), sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: asset('/icons/icon-512.png'), sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: asset('/icons/maskable-512.png'), sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Voucher entry', url: asset('/accounts/vouchers/') },
      { name: 'Day book', url: asset('/accounts/daybook/') },
      { name: 'CRM / Leads', url: asset('/accounts/crm/') },
    ],
  };
}
