import { registerSW } from 'virtual:pwa-register'
import { toast } from 'sonner'

// El navegador solo revisa si hay un Service Worker nuevo una vez cada 24h
// por registro (límite fijo del spec, no configurable) — por eso alguien con
// la pestaña abierta, o que simplemente recarga varias veces el mismo día,
// se queda viendo la versión vieja hasta un Ctrl+Shift+R (que sí fuerza esa
// revisión). registration.update() se salta ese límite: llamándolo nosotros
// por intervalo, el navegador se entera de un deploy nuevo sin que el
// usuario tenga que hacer nada.
//
// La otra mitad de la causa (la que de verdad obligaba al Ctrl+Shift+R)
// estaba en src/sw.js: el SW nuevo se instalaba pero nunca se activaba (se
// quedaba en "waiting" para siempre). Con self.skipWaiting()/clients.claim()
// ahí, en cuanto termina de instalar toma control, y registerType:'autoUpdate'
// (vite.config.js) dispara onNeedReload aquí abajo.
const INTERVALO_MS = 5 * 60 * 1000

// Evita un loop de recargas: si onNeedReload ya disparó una recarga en esta
// pestaña, no lo vuelve a hacer hasta el próximo arranque de la app (se
// limpia al inicio de registrarActualizacionAutomatica, que corre una vez
// por carga de página).
const CLAVE_RECARGA_EN_CURSO = 'skynet:actualizando'

export function registrarActualizacionAutomatica() {
  if (!import.meta.env.PROD) return
  sessionStorage.removeItem(CLAVE_RECARGA_EN_CURSO)

  registerSW({
    immediate: true,
    onRegisteredSW(_url, registration) {
      if (!registration) return
      const revisar = () => {
        if (document.visibilityState === 'visible') registration.update()
      }
      setInterval(revisar, INTERVALO_MS)
      // Cubre el caso más común: el usuario cambia de pestaña/app y vuelve,
      // sin esperar a que se cumpla el intervalo.
      document.addEventListener('visibilitychange', revisar)
    },
    onNeedReload() {
      if (sessionStorage.getItem(CLAVE_RECARGA_EN_CURSO)) return
      sessionStorage.setItem(CLAVE_RECARGA_EN_CURSO, '1')
      toast.info('Hay una nueva versión de Skynet disponible. Actualizando…')
      // El pequeño retraso es solo para que el aviso alcance a leerse antes
      // de que la pestaña se recargue con la versión nueva ya activa.
      setTimeout(() => window.location.reload(), 1500)
    },
  })
}
