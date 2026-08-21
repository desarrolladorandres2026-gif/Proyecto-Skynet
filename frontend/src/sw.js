import { precacheAndRoute } from 'workbox-precaching'

// self.__WB_MANIFEST lo reemplaza vite-plugin-pwa (strategies:'injectManifest',
// ver vite.config.js) por la lista real de assets del build en tiempo de
// compilación — en dev este archivo no se procesa así (la PWA sigue
// deshabilitada en dev, ver swKillSwitch en vite.config.js).
precacheAndRoute(self.__WB_MANIFEST)

// CAUSA RAÍZ del "hay que hacer Ctrl+Shift+R": con strategies:'injectManifest'
// nada activa el SW nuevo automáticamente (a diferencia de generateSW). Sin
// estas dos líneas, cada deploy instalaba un SW nuevo que se quedaba en
// estado "waiting" PARA SIEMPRE — nunca disparaba el evento 'activated' que
// escucha src/pwa/actualizacionAutomatica.js (registerType:'autoUpdate') para
// recargar la pestaña sola. skipWaiting() lo activa en cuanto termina de
// instalar; clients.claim() hace que tome control de las pestañas ya
// abiertas sin esperar a que se cierren y vuelvan a abrir.
self.skipWaiting()
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

// Sin este listener, un push que el backend manda (ver
// Backend/src/modules/notificaciones/notificaciones.service.js) llega al
// navegador pero nunca se muestra como notificación del sistema — es la
// pieza que faltaba para que "push visible con la app cerrada" funcionara.
self.addEventListener('push', (event) => {
  if (!event.data) return

  let payload
  try {
    payload = event.data.json()
  } catch {
    payload = { title: 'Skynet', body: event.data.text() }
  }

  const { title = 'Skynet', body = '', url = '/', tag } = payload

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, {
        body,
        tag,
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        data: { url },
      }),
      // Le avisa a cada pestaña/ventana abierta de la PWA que llegó un push
      // real, para que la campana (useCentroNotificaciones.js) refresque su
      // contador de una vez en vez de esperar hasta 45s al próximo tick de
      // su polling de respaldo. `includeUncontrolled` porque una pestaña
      // abierta ANTES de que este SW tomara control también debe enterarse.
      self.clients
        .matchAll({ type: 'window', includeUncontrolled: true })
        .then((clientes) => clientes.forEach((c) => c.postMessage({ type: 'SKYNET_PUSH_RECEIVED' }))),
    ])
  )
})

// Al hacer clic: reusa una pestaña de la PWA ya abierta si existe (foco +
// navegación) en vez de abrir una ventana nueva cada vez — es lo que hace
// que se sienta como "abrir dentro de la app" y no como un enlace suelto.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/'

  event.waitUntil(
    (async () => {
      const absoluta = new URL(url, self.location.origin).href
      const clientesAbiertos = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })

      const exacto = clientesAbiertos.find((c) => c.url === absoluta)
      if (exacto) return exacto.focus()

      const mismoOrigen = clientesAbiertos.find((c) => c.url.startsWith(self.location.origin))
      if (mismoOrigen) {
        await mismoOrigen.focus()
        if ('navigate' in mismoOrigen) return mismoOrigen.navigate(absoluta)
        return
      }

      return self.clients.openWindow(absoluta)
    })()
  )
})
