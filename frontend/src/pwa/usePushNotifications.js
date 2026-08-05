import { useCallback, useEffect, useState } from 'react'
import { notificaciones } from '../api/notificaciones.js'

function soportaPush() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

// La clave pública VAPID viaja en base64url; pushManager.subscribe() exige
// un Uint8Array, no el string tal cual.
function base64UrlAUint8Array(base64Url) {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4)
  const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
}

// Estado y acciones de la suscripción push DE ESTE dispositivo/navegador
// concreto (un mismo usuario puede tener varias — ver
// PreferenciasNotificacionesPage para la lista completa de dispositivos).
export function usePushNotifications() {
  const [soportado] = useState(soportaPush)
  const [permiso, setPermiso] = useState(() => (soportaPush() ? Notification.permission : 'no-soportado'))
  const [suscrito, setSuscrito] = useState(null) // null = todavía no se sabe
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!soportado) return
    let activo = true
    navigator.serviceWorker.ready
      .then((registro) => registro.pushManager.getSubscription())
      .then((sub) => {
        if (activo) setSuscrito(Boolean(sub))
      })
      .catch(() => {
        if (activo) setSuscrito(false)
      })
    return () => {
      activo = false
    }
  }, [soportado])

  // Se llama SOLO desde el handler de clic de un botón real. Pedir el
  // permiso al montar la página es justo el patrón que los navegadores
  // penalizan (auto-silencian el prompt) y que el requisito de UX pide
  // evitar explícitamente.
  const activar = useCallback(async () => {
    if (!soportado) return
    setCargando(true)
    setError('')
    try {
      const resultado = await Notification.requestPermission()
      setPermiso(resultado)
      if (resultado !== 'granted') return

      const registro = await navigator.serviceWorker.ready
      const { publicKey } = await notificaciones.vapidPublicKey()
      if (!publicKey) throw new Error('El servidor no tiene configuradas las claves VAPID todavía')

      const sub = await registro.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlAUint8Array(publicKey),
      })
      await notificaciones.suscribirPush(sub.toJSON())
      setSuscrito(true)

      // Recarga tras aceptar el permiso: no hace falta para conservar la
      // sesión (el token vive en una cookie httpOnly que el navegador ya
      // reenvía solo en cada request, con o sin recarga — ver api/client.js).
      // Es para que el propio Service Worker recién registrado quede
      // "activo" de inmediato en vez de en estado waiting/installing, que es
      // lo que en algunos navegadores (sobre todo Android/Chrome en el
      // acceso directo instalado) retrasa que el push realmente funcione
      // hasta la siguiente carga natural de la página.
      window.location.reload()
    } catch (err) {
      setError(err.message || 'No se pudo activar las notificaciones push')
    } finally {
      setCargando(false)
    }
  }, [soportado])

  const desactivar = useCallback(async () => {
    if (!soportado) return
    setCargando(true)
    setError('')
    try {
      const registro = await navigator.serviceWorker.ready
      const sub = await registro.pushManager.getSubscription()
      if (sub) {
        await notificaciones.desuscribirPush(sub.endpoint)
        await sub.unsubscribe()
      }
      setSuscrito(false)
    } catch (err) {
      setError(err.message || 'No se pudo desactivar las notificaciones push')
    } finally {
      setCargando(false)
    }
  }, [soportado])

  return { soportado, permiso, suscrito, cargando, error, activar, desactivar }
}
