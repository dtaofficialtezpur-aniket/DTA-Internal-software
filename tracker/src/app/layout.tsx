import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import Providers from '@/components/Providers';
import { asset } from '@/lib/asset';
import './globals.css';

export const metadata: Metadata = {
  title: 'DTA Client Data Tracker',
  description: 'Accounts, digital marketing and trading clients with Tally-style books. Works offline.',
  applicationName: 'DTA Tracker',
  appleWebApp: { capable: true, title: 'DTA Tracker', statusBarStyle: 'default' },
  icons: { icon: [{ url: asset('/icons/icon-192.png'), sizes: '192x192', type: 'image/png' }], apple: [{ url: asset('/icons/apple-touch-icon.png'), sizes: '180x180' }] },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: '#2f5bea',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
