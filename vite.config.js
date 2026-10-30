import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 900,
  },
  server: {
    port: 5173,
    // Для отдельной разработки фронта: API проксируется на wrangler dev
    proxy: {
      '/api': 'http://127.0.0.1:8787',
    },
  },
});
