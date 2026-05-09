import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Pi backend dev origin (Codex agent's worktree, peer qxag7qtb).
// Override with VITE_PI_BACKEND if running elsewhere.
const PI_BACKEND = process.env.VITE_PI_BACKEND ?? 'http://127.0.0.1:4173';
const PI_WS_BACKEND = PI_BACKEND.replace(/^http/, 'ws');

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    host: '127.0.0.1',
    proxy: {
      // Same-origin path for the Test-Demo WS, forwarded to Pi server.
      // Aligns with the cookie-auth direction (one origin in dev and prod).
      '/ws/test-demo': { target: PI_WS_BACKEND, ws: true, changeOrigin: true },
      // HTTP fallthrough for Pi's REST surface (smoke / codex).
      '/api/pi':       { target: PI_BACKEND,    changeOrigin: true },
    },
  },
});
