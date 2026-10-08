import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' so the built app also works when opened from file:// (Electron), like the main DTA dashboard.
export default defineConfig({ plugins: [react()], base: './', build: { outDir: 'dist', emptyOutDir: true } });
