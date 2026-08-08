import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// Service worker "kill-switch": un proyecto legado corrió en este mismo
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
      // injectManifest (no generateSW): necesitamos un Service Worker propio
      // que reaccione a 'push' y 'notificationclick' (ver src/sw.js) — el SW
      // que genera Workbox automáticamente en modo generateSW no incluye esos
      // listeners, así que hasta ahora ningún push llegaba a mostrarse aunque
      // el backend lo mandara (ver docs/notificaciones/README.md).
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      injectManifest: {
        // El motor de voz offline (vosk-browser) son ~5,8 MB de WebAssembly
        // que SOLO usa el asistente de escritorio (ver
        // src/escritorio/reconocedorVosk.js). Se excluye del precache del
        // service worker por dos razones:
        //  1. Precacharlo obligaría a CADA usuario del panel web a descargar
        //     5,8 MB de algo que su navegador no puede usar (la Web Speech
        //     API es la que funciona ahí).
        //  2. Supera el límite por archivo de Workbox, así que la build
        //     fallaba directamente.
        // Se carga bajo demanda con import() dinámico, que es justo lo que lo
        // mantiene fuera del bundle principal.
        globIgnores: ['**/vosk-*.js'],
      },
      manifest: {
        name: 'Skynet',
        short_name: 'Skynet',
        description: 'Sistema unificado de Mantenimiento',
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
    }),
  ],
  server: {
    host: true, // escucha en 0.0.0.0: accesible desde otros dispositivos en la misma red (celular, etc.)
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
