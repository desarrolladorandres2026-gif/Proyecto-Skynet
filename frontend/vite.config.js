import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// Service worker "kill-switch": el proyecto SIGITTN viejo corrió en este mismo
// puerto (5173) y dejó un SW registrado en el navegador que intercepta las
// peticiones y responde "Resource was not cached". El navegador re-descarga el
// script del SW en cada navegación; aquí respondemos en esas mismas URLs con
// un SW que se desregistra, borra las cachés y recarga la página.
const KILL_SW = `
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    await self.registration.unregister()
    const keys = await caches.keys()
    await Promise.all(keys.map((k) => caches.delete(k)))
    const clients = await self.clients.matchAll({ type: 'window' })
    clients.forEach((client) => client.navigate(client.url))
  })())
})
`

const swKillSwitch = {
  name: 'sw-kill-switch',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      const path = (req.url || '').split('?')[0]
      if (path === '/dev-sw.js' || path === '/sw.js') {
        res.setHeader('Content-Type', 'text/javascript')
        res.end(KILL_SW)
        return
      }
      // El index.html viejo cacheado referencia /registerSW.js: responder vacío
      // para que no vuelva a registrar el SW zombie.
      if (path === '/registerSW.js') {
        res.setHeader('Content-Type', 'text/javascript')
        res.end('/* SW retirado */')
        return
      }
      next()
    })
  },
}

export default defineConfig({
  plugins: [
    swKillSwitch,
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Skynet',
        short_name: 'Skynet',
        description: 'Sistema unificado de Mantenimiento y SIGITTN',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            urlPattern: /^https?:\/\/.*\/api\/.*/,
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
  ],
  server: {
    proxy: {
      '/api': {
        target: process.env.VITE_BACKEND_URL || 'http://localhost:3001',
        changeOrigin: true,
      },
      '/storage': {
        target: process.env.VITE_BACKEND_URL || 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
