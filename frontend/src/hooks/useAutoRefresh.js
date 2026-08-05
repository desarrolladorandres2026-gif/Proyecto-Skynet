import { useEffect, useRef } from 'react'

/**
 * Vuelve a ejecutar `fetchFn` cada `intervalMs` mientras la pestaña está
 * visible, y de inmediato al recuperar foco/visibilidad — así se ven
 * estados cambiados por otro usuario (ej. Financiero aprueba, Bodega
 * despacha) sin que quien mira la pantalla tenga que recargar a mano.
 *
 * `fetchFn` se guarda en un ref para que cambios de identidad en cada
 * render (funciones inline, closures sobre filtros, etc.) no reinicien el
 * temporizador — solo `intervalMs`/`enabled` lo hacen.
 */
export function useAutoRefresh(fetchFn, { intervalMs = 20000, enabled = true } = {}) {
  const fetchRef = useRef(fetchFn)
  fetchRef.current = fetchFn

  useEffect(() => {
    if (!enabled) return

    const tick = () => {
      if (document.visibilityState === 'visible') fetchRef.current()
    }

    const id = setInterval(tick, intervalMs)
    document.addEventListener('visibilitychange', tick)
    window.addEventListener('focus', tick)

    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', tick)
      window.removeEventListener('focus', tick)
    }
  }, [intervalMs, enabled])
}
