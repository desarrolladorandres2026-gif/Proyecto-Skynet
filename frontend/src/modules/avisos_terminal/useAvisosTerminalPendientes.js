import { useEffect, useRef } from 'react'
import { avisosTerminal } from '../../api/avisosTerminal.js'

// No hay WebSocket en el proyecto (ver notificaciones/useAvisosIA.js: mismo
// criterio arquitectónico) — un anuncio institucional se siente "en tiempo
// real" combinando dos caminos que ya conviven en el resto del sistema:
//  1. Push real (VAPID) cuando el Service Worker recibe el evento 'push' y
//     reenvía un postMessage SKYNET_AVISO_RECIBIDO a esta pestaña (ver
//     sw.js) — dispara una revisión INMEDIATA, sin esperar al intervalo.
//  2. Polling corto de respaldo (8s, más agresivo que los 25s de avisos de
//     IA o los 45s de la campana) para cubrir el caso sin permiso de
//     notificaciones o con el push todavía no confirmado por el navegador.
const INTERVALO_MS = 8_000

// `onPendientes` debe ser estable (useCallback en el llamador): es
// dependencia del efecto, y si cambiara en cada render el polling se
// reiniciaría sin parar en vez de mantener un solo intervalo vivo.
export function useAvisosTerminalPendientes({ activo, onPendientes }) {
  const revisandoRef = useRef(false)

  useEffect(() => {
    if (!activo) return
    let cancelado = false

    async function revisar() {
      if (revisandoRef.current) return // evita solapar si el foco/push disparan justo durante un poll
      revisandoRef.current = true
      try {
        const { entregas } = await avisosTerminal.pendientes()
        if (cancelado || !entregas?.length) return
        onPendientes(entregas)
      } catch {
        // Fallo de red/servidor en un poll de fondo: nada que mostrar por
        // esto, el siguiente intervalo reintenta.
      } finally {
        revisandoRef.current = false
      }
    }

    revisar()
    const id = setInterval(revisar, INTERVALO_MS)

    function alRecuperarFoco() {
      if (document.visibilityState === 'visible') revisar()
    }
    window.addEventListener('focus', alRecuperarFoco)
    document.addEventListener('visibilitychange', alRecuperarFoco)

    function alMensajeSW(event) {
      if (event.data?.type === 'SKYNET_AVISO_RECIBIDO') revisar()
    }
    navigator.serviceWorker?.addEventListener?.('message', alMensajeSW)

    return () => {
      cancelado = true
      clearInterval(id)
      window.removeEventListener('focus', alRecuperarFoco)
      document.removeEventListener('visibilitychange', alRecuperarFoco)
      navigator.serviceWorker?.removeEventListener?.('message', alMensajeSW)
    }
  }, [activo, onPendientes])
}
