import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Vite serves the SPA in dev (port 5173) and proxies /api to the Express
// backend (port 8000). In production Express serves the built dist/ directory.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.API_PROXY_TARGET || 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
  },
})
