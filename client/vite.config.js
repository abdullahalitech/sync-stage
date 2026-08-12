import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // Vite 6 blocks unknown Host headers (DNS rebinding protection).
    allowedHosts: ['.railway.app'],
  },
  preview: {
    host: true,
    allowedHosts: ['.railway.app'],
  },
});
