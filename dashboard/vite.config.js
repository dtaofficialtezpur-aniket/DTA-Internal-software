import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base: './' is required — the built app is opened via file:// inside
// Electron (see desktop/main.js), and Vite's default '/' absolute asset
// paths resolve against the filesystem root under file://, not the
// page's own folder, which breaks every asset. Relative paths fix that.
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
