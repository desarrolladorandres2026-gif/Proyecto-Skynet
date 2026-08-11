import { registerSW } from 'virtual:pwa-register'

// El navegador solo revisa si hay un Service Worker nuevo una vez cada 24h
// por registro (límite fijo del spec, no configurable) — por eso alguien con
// la pestaña abierta, o que simplemente recarga varias veces el mismo día,
// se queda viendo la versión vieja hasta un Ctrl+Shift+R (que sí fuerza esa
// revisión). registration.update() se salta ese límite: llamándolo nosotros
// por intervalo, el navegador se entera de un deploy nuevo sin que el
// usuario tenga que hacer nada. registerType:'autoUpdate' (vite.config.js)
// hace el resto: en cuanto detecta el SW nuevo, lo activa y recarga solo.
const INTERVALO_MS = 5 * 60 * 1000

export function registrarActualizacionAutomatica() {
  if (!import.meta.env.PROD) return

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
  })
}
