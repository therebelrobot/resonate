import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The client is served by the Hono server in production (same origin, strict CSP).
// In development, Vite proxies /api to the dev server so cookies stay same-origin.
// The dev server listens on 8788 rather than the more common 8787 so it can run
// alongside other local apps without a port clash.
export default defineConfig({
  root: 'client',
  plugins: [react()],
  build: {
    outDir: '../dist/public',
    emptyOutDir: true,
    // Keep every script and style as an external file: the production CSP
    // forbids inline scripts and inline <style> blocks.
    assetsInlineLimit: 0,
    sourcemap: false,
  },
  server: {
    port: 5173,
    proxy: {
      // Anchor to a path boundary: a bare '/api' prefix also matches the client
      // module '/api.ts', which would proxy the app's own source to the backend
      // and blank the page. The regex matches '/api/...' and '/api' only.
      '^/api(?:/|$)': {
        // Keep the browser's Host so the server's same-origin check sees the
        // Vite origin (http://localhost:5173), not the backend's.
        target: 'http://localhost:8788',
        changeOrigin: false,
      },
    },
  },
})
