import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  root,
  plugins: [react()],
  build: { outDir: '../dist/client', emptyOutDir: true, target: ['es2020', 'safari14'] },
  server: {
    port: 5173,
    host: true,
    proxy: { '/api': { target: 'http://localhost:3000', changeOrigin: false } },
  },
});
