/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Porta da API no proxy de /api, no dev e no preview (veja .env.example).
const apiPort = process.env.LENS_FLOW_API_PORT || '5000'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      // O cookie de sessão tem Path=/api: o site chama a API pela mesma origem (T3).
      '/api': { target: `http://localhost:${apiPort}`, changeOrigin: false },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
    // Folga sobre os 5 s do padrão: já houve teste passando com 4,7 s.
    testTimeout: 15_000,
  },
})
