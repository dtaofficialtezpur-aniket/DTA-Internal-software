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
      includeAssets: ['icon.png'],
      manifest: {
        name: 'DTA Digital department',
        short_name: 'DTA',
        description: 'DTA-internal client subscription and access manager.',
        theme_color: '#0f1621',
        background_color: '#0f1621',
        display: 'standalone',
        start_url: '.',
        scope: '.',
        icons: [
          { src: 'icon.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Precache the app shell (HTML/CSS/JS/fonts) so the installed PWA
        // opens with no network at all. Actual data (clients, settings)
        // is handled separately through IndexedDB, not HTTP caching —
        // API responses change too often and need the online/offline
        // queue logic in AppContext.jsx, not a cache-first strategy.
        globPatterns: ['**/*.{js,css,html,png}'],
        // The OCR engine + PDF renderer (src/ocr/runOcr.js) are ~10MB of
        // static assets nobody may ever need (only used for scanned/
        // photographed documents) — excluded from the eager install-time
        // precache above, and instead cached the first time they're
        // actually fetched, via the runtime rule below. After that first
        // use, OCR keeps working offline too.
        globIgnores: ['tesseract/**', 'pdfjs/**'],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.includes('/tesseract/') || url.pathname.includes('/pdfjs/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'ocr-engine',
              expiration: { maxEntries: 20 },
            },
          },
        ],
      },
    }),
  ],
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
