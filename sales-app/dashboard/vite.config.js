import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { pdfBase64 } from './vite.plugins.js';

// base './' so the built app also works when opened from file:// (Electron), like the main DTA dashboard.
export default defineConfig({ plugins: [pdfBase64(), react()], base: './', build: { outDir: 'dist', emptyOutDir: true } });
