import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Config de test separada de vite.config.js a propósito: cargar VitePWA y
// @tailwindcss/vite en cada test no aporta nada (son plugins de build/CSS) y
// sí agregan tiempo y superficie de fallo.
export default defineConfig({
  plugins: [react()],
  // Red de seguridad además del plugin react(): si algún archivo se le
  // escapa al transform de Babel del plugin, que esbuild igual use el
  // runtime automático (jsx sin necesitar `React` en scope) en vez de su
  // propio default clásico.
  esbuild: { jsx: 'automatic' },
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.js'],
  },
})
