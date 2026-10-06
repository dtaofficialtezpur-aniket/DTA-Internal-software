import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// base: './' is required — the built app is opened via file:// inside
// Electron (see desktop/main.js), and Vite's default '/' absolute asset
// paths resolve against the filesystem root under file://, not the
// page's own folder, which breaks every asset. Relative paths fix that.
//
// The same build also ships as the browser/PWA version (deployed to
// Vercel). The service worker this plugin generates only registers when
// `navigator.serviceWorker` exists, which Chromium doesn't expose under
// file:// — so it's inert inside Electron and only takes effect in a
// real browser.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'DTA Subscription Control',
        short_name: 'DTA Subs',
        description: 'DTA-internal client subscription and access manager.',
        theme_color: '#3d4fe0',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '.',
        scope: '.',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
        ],
      },
      workbox: {
        // Precache the app shell (HTML/CSS/JS/fonts) so the installed PWA
        // opens with no network at all. Actual data (clients, settings)
        // is handled separately through IndexedDB, not HTTP caching —
        // API responses change too often and need the online/offline
        // queue logic in AppContext.jsx, not a cache-first strategy.
        globPatterns: ['**/*.{js,css,html,svg}'],
      },
    }),
  ],
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
