import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// One self-contained HTML file with sample data (preview mode). Open it by double-clicking.
// The CSP meta tag is dropped here only because inline scripts are what make it a single file.
export default defineConfig({
  plugins: [react(), viteSingleFile(), { name: 'drop-csp', transformIndexHtml: (h) => h.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, '') }],
  base: './',
  build: { outDir: 'dist-single', emptyOutDir: true },
});
