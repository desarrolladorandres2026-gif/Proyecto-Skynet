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

// Red de seguridad para un SW que se quedó en "waiting". El skipWaiting() de
// arriba lo cubre en el caso normal, pero no cuando el SW que hoy controla la
// pestaña es una build ANTERIOR a esa línea: ese SW viejo no cede el control
// solo. src/pwa/actualizacionAutomatica.js manda este mensaje después de cada
// registration.update() si encuentra un registration.waiting.
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()
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
    payload = { title: 'Terminal de Transportes de Neiva', body: event.data.text() }
  }

  const { title = 'Terminal de Transportes de Neiva', body = '', url = '/', tag, tipo, textoLocucion } = payload
  // Avisos Terminal de Neiva (anuncio institucional por voz, ver
  // Backend/src/modules/avisos_terminal): la campanita y la reproducción de
  // voz las arma AvisoTerminalPlayer.jsx en la propia página, nunca el
  // Service Worker (no hay audio que reproducir "sin abrir la app": las
  // restricciones de autoplay de Android/iOS lo impiden — un SW no puede
  // tocar audio por sí mismo). Lo único que hace este handler es mostrar la
  // notificación visual del sistema, usando `textoLocucion` (ya resuelto por
  // el backend, con el prefijo institucional incluido) en vez de reconstruir
  // esa frase acá: el backend es la única fuente de verdad de cómo empieza
  // un aviso (ver PREFIJO_INSTITUCIONAL en avisos.service.js) — repetirla
  // aquí como literal solo crea una tercera copia que se puede desincronizar
  // si el texto cambia algún día.
  const esAvisoTerminal = tipo === 'aviso_terminal'

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, {
        body: esAvisoTerminal && textoLocucion ? textoLocucion : body,
        tag,
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        data: { url, tipo },
        // Avisos Terminal de Neiva: se comportan como un anuncio oficial, no
        // como un mensaje de chat que se puede pasar por alto.
        // requireInteraction mantiene la notificación visible hasta que la
        // persona la atienda (Android igual puede recortarla tras un rato en
        // segundo plano — es un pedido, no una garantía del sistema, pero es
        // lo más fuerte que expone la Notifications API). El patrón de
        // vibración es intencionalmente distinto al de cualquier otra
        // notificación del sistema (dos pulsos cortos + uno largo) para que
        // se sienta a un anuncio institucional y no a un mensaje cualquiera.
        // La acción "Escuchar ahora" es un atajo directo al mismo destino
        // que tocar el cuerpo (ver notificationclick abajo) — mismo
        // resultado, solo una superficie de toque adicional.
        ...(esAvisoTerminal
          ? {
              requireInteraction: true,
              vibrate: [200, 80, 200, 80, 400],
              actions: [{ action: 'escuchar', title: '🔊 Escuchar ahora' }],
            }
          : {}),
      }),
      // Le avisa a cada pestaña/ventana abierta de la PWA que llegó un push
      // real. La campana (useCentroNotificaciones.js) escucha
      // SKYNET_PUSH_RECEIVED para refrescar su contador de una vez en vez de
      // esperar hasta 45s al próximo tick de su polling de respaldo; el
      // reproductor de avisos (useAvisosTerminalPendientes.js) escucha
      // SKYNET_AVISO_RECIBIDO para lo mismo con su propio polling de 8s.
      // Ambos mensajes se mandan siempre (no solo el que aplica) para no
      // tener que ramificar esta lista según el tipo de payload.
      // `includeUncontrolled` porque una pestaña abierta ANTES de que este SW
      // tomara control también debe enterarse.
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientes) =>
        clientes.forEach((c) => {
          c.postMessage({ type: 'SKYNET_PUSH_RECEIVED' })
          if (esAvisoTerminal) c.postMessage({ type: 'SKYNET_AVISO_RECIBIDO' })
        })
      ),
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
