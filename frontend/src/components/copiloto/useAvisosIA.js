import { useEffect, useRef } from 'react'
import { ia as iaApi } from '../../api/ia.js'

// Avisos proactivos (nuevo requerimiento, nuevo daño...): el backend los
// encola en AvisoIA (ver Backend/src/utils/sendPush.js -> ia.service.js) cada
// vez que un evento de negocio ya notificó por push/email Y el usuario los
// permite. No hay WebSocket — se hace polling corto mientras el widget está
// montado (siempre, desde AppShell), más un chequeo inmediato al recuperar
// el foco de la pestaña, mismo patrón que EmailConfiguracionPage.jsx.
const INTERVALO_MS = 25_000

// `onAvisos` debe ser estable (useCallback en el llamador): se declara como
// dependencia del efecto, y si cambiara en cada render el polling se
// reiniciaría sin parar en vez de mantener un solo intervalo vivo.
export function useAvisosIA({ activo, onAvisos }) {
  const revisandoRef = useRef(false)

  useEffect(() => {
    if (!activo) return
    let cancelado = false

    async function revisar() {
      if (revisandoRef.current) return // evita solapar si el foco dispara justo durante un poll
      revisandoRef.current = true
      try {
        const { avisos } = await iaApi.avisosPendientes()
        if (cancelado || !avisos?.length) return
        onAvisos(avisos)
        // Se marcan leídos DESPUÉS de entregárselos al widget (burbuja +
        // voz ya encoladas): si el marcado fallara, el próximo poll los
        // vuelve a traer en vez de perderlos en silencio.
        await iaApi.marcarAvisosLeidos(avisos.map((a) => a._id))
      } catch {
        // Fallo de red/servidor en un poll de fondo: no hay nada que
        // mostrarle al usuario por esto, el siguiente intervalo reintenta.
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

    return () => {
      cancelado = true
      clearInterval(id)
      window.removeEventListener('focus', alRecuperarFoco)
      document.removeEventListener('visibilitychange', alRecuperarFoco)
    }
  }, [activo, onAvisos])
}
