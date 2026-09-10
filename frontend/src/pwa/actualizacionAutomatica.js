import { registerSW } from 'virtual:pwa-register'
import { toast } from 'sonner'

// POR QUÉ EXISTE ESTE ARCHIVO
//
// El navegador solo revisa si hay un Service Worker nuevo una vez cada 24h
// por registro (límite fijo del spec, no configurable) — salvo cuando NAVEGA
// a una página dentro del alcance del SW: ahí revalida /sw.js siempre. Esa
// revisión de navegación es la que hacía que el aviso de versión nueva solo
// apareciera DESPUÉS de recargar a mano: con la pestaña quieta no había nada
// que se enterara del despliegue.
//
// Lo que cubre cada pieza de abajo, en orden de fiabilidad:
//
//  1. 'controllerchange' (navigator.serviceWorker) — la señal fuerte. En
//     cuanto el SW nuevo se activa y llama a clients.claim() (ver src/sw.js),
//     TODA pestaña abierta recibe este evento. No depende de heurísticas de
//     workbox ni de que el aviso llegue por el camino de vite-plugin-pwa.
//     Es lo que faltaba: onNeedReload por sí solo no bastaba (ver punto 3).
//  2. registration.update() por intervalo/foco — es lo que provoca el punto 1
//     sin esperar a las 24h del navegador ni a la próxima navegación.
//  3. onNeedReload de vite-plugin-pwa — se conserva como respaldo, pero NO se
//     puede depender solo de él: workbox-window se quita a sí mismo el
//     listener de 'updatefound' la primera vez que clasifica una
//     actualización como "externa", y toda actualización que encuentre
//     nuestro update() lo es (ocurre más de 60s después del registro, que es
//     el umbral que usa workbox). Resultado: el segundo despliegue de una
//     misma sesión ya no disparaba nada.
const INTERVALO_MS = 60 * 1000

// registration.update() sale a la red. 'focus' y 'visibilitychange' se pisan
// entre sí al hacer alt-tab, así que se limita a una revisión cada 15s en vez
// de una por evento.
const MINIMO_ENTRE_REVISIONES_MS = 15 * 1000

// Evita un loop de recargas: si ya se disparó una recarga en esta pestaña, no
// se vuelve a hacer hasta el próximo arranque de la app (se limpia al inicio
// de registrarActualizacionAutomatica, que corre una vez por carga de página).
// También deduplica los tres caminos de detección de arriba, que pueden
// dispararse casi a la vez para la misma versión.
const CLAVE_RECARGA_EN_CURSO = 'skynet:actualizando'

export function registrarActualizacionAutomatica() {
  if (!import.meta.env.PROD) return
  if (!('serviceWorker' in navigator)) return
  sessionStorage.removeItem(CLAVE_RECARGA_EN_CURSO)

  // Sin este guardia, la PRIMERA instalación del SW (visita inicial de alguien
  // que nunca abrió la app) dispararía 'controllerchange' al reclamar la
  // pestaña y recargaríamos una página recién abierta que ya está al día.
  // Solo hay "versión nueva" si antes ya había una versión controlando.
  const habiaControlador = Boolean(navigator.serviceWorker.controller)

  const alDetectarVersionNueva = () => {
    if (!habiaControlador) return
    if (sessionStorage.getItem(CLAVE_RECARGA_EN_CURSO)) return
    sessionStorage.setItem(CLAVE_RECARGA_EN_CURSO, '1')
    aplicarVersionNueva()
  }

  navigator.serviceWorker.addEventListener('controllerchange', alDetectarVersionNueva)

  registerSW({
    immediate: true,
    onRegisteredSW(_url, registration) {
      if (!registration) return

      // Arranca "ya revisado": la propia navegación que cargó esta página
      // acaba de revalidar /sw.js, repetirlo aquí sería una petición de más
      // compitiendo con la carga inicial.
      let ultimaRevision = Date.now()

      const revisar = async () => {
        if (document.visibilityState !== 'visible') return
        if (Date.now() - ultimaRevision < MINIMO_ENTRE_REVISIONES_MS) return
        ultimaRevision = Date.now()

        try {
          await registration.update()
        } catch {
          // Sin red, o el servidor caído: no es algo que el usuario deba ver,
          // el próximo intento lo recoge.
          return
        }

        // Red de seguridad: si el SW nuevo se quedó en "waiting" en vez de
        // activarse solo, se le pide que pase (lo atiende el listener
        // 'message' de src/sw.js). Pasa cuando el SW que controla la pestaña
        // es una build anterior al self.skipWaiting() de src/sw.js.
        registration.waiting?.postMessage({ type: 'SKIP_WAITING' })
      }

      setInterval(revisar, INTERVALO_MS)
      // Cubre al usuario que cambia de pestaña/app y vuelve.
      document.addEventListener('visibilitychange', revisar)
      // visibilitychange NO se dispara al volver a una ventana que nunca se
      // ocultó (otro monitor, la PWA de escritorio, un kiosco): ahí 'focus' es
      // el único aviso de que alguien volvió a mirar la pantalla.
      window.addEventListener('focus', revisar)
      // Volver de un corte de red: la revisión que falló mientras no había
      // conexión se reintenta de inmediato en vez de esperar al intervalo.
      window.addEventListener('online', revisar)
    },
    onNeedReload: alDetectarVersionNueva,
  })
}

// QUÉ HACER CUANDO YA HAY VERSIÓN NUEVA LISTA.
//
// Separado a propósito de la detección de arriba: la detección es mecánica y
// no tiene alternativas razonables, esto es una decisión de producto.
//
// El comportamiento de hoy: avisar y recargar solo a los 1,5s. El riesgo es
// que la recarga cae encima de quien esté a mitad de un formulario (una OT de
// mantenimiento a medio llenar se pierde sin más).
function aplicarVersionNueva() {
  toast.info('Hay una nueva versión disponible. Actualizando…')
  // El retraso es solo para que el aviso alcance a leerse antes de que la
  // pestaña se recargue con la versión nueva ya activa.
  setTimeout(() => window.location.reload(), 1500)
}
