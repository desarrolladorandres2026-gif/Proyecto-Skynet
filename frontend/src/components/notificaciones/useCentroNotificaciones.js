import { useCallback, useEffect, useRef, useState } from 'react'
import { notificaciones as notificacionesApi } from '../../api/notificaciones.js'

// Polling ligero de fallback (no agresivo): el contador de no leídas es
// barato de consultar (un countDocuments indexado), así que 45s es
// suficiente para que la campana no se sienta desactualizada sin martillar
// al backend. El mecanismo PRINCIPAL para refrescar al instante es el push:
// cuando llega uno de verdad (ver sw.js), el Service Worker le manda un
// postMessage a cada pestaña abierta y esta salta la espera.
const INTERVALO_POLLING_MS = 45_000

// CentroNotificacionesPage (el historial completo) marca notificaciones como
// leídas por su cuenta, con su propio fetch — no comparte estado con este
// hook (cada <NotificacionesBell> tiene su propia instancia). Sin este
// evento, el contador de la campana quedaba desactualizado hasta el próximo
// poll (45s) o cambio de foco, aunque el usuario ya las hubiera leído.
export const EVENTO_NOTIFICACIONES_ACTUALIZADAS = 'skynet:notificaciones-actualizadas'

export function useCentroNotificaciones() {
  const [noLeidas, setNoLeidas] = useState(0)
  const [notificaciones, setNotificaciones] = useState([])
  const [cargando, setCargando] = useState(false)
  const cargandoListaRef = useRef(false)

  const refrescarContador = useCallback(async () => {
    try {
      const { total } = await notificacionesApi.noLeidas()
      setNoLeidas(total)
    } catch {
      // Fallo de red en un refresco de fondo: no hay nada que mostrarle al
      // usuario por esto, el próximo intervalo (o el próximo push) reintenta.
    }
  }, [])

  const cargarLista = useCallback(async () => {
    if (cargandoListaRef.current) return
    cargandoListaRef.current = true
    setCargando(true)
    try {
      const { notificaciones: lista } = await notificacionesApi.misNotificaciones({ page: 1, limit: 15 })
      setNotificaciones(lista)
    } catch {
      // Igual que arriba: el usuario puede reintentar abriendo de nuevo.
    } finally {
      setCargando(false)
      cargandoListaRef.current = false
    }
  }, [])

  // Leer una notificación la borra de Mongo en el acto (ver
  // centro.service.js#marcarLeida) — no queda registro, así que acá también
  // desaparece de inmediato, sin retardo ni estado "leída" intermedio.
  const marcarLeida = useCallback(async (id) => {
    setNotificaciones((lista) => lista.filter((n) => n._id !== id))
    setNoLeidas((n) => Math.max(0, n - 1))
    try {
      await notificacionesApi.marcarLeida(id)
    } catch {
      // Revertir sería más ruido que ayuda para un solo clic fallido; el
      // próximo refrescarContador() (poll o push) corrige el número si de
      // verdad no se guardó.
    }
  }, [])

  const marcarTodasLeidas = useCallback(async () => {
    setNotificaciones([])
    setNoLeidas(0)
    try {
      await notificacionesApi.marcarTodasLeidas()
    } catch {
      refrescarContador()
    }
  }, [refrescarContador])

  useEffect(() => {
    refrescarContador()
    const id = setInterval(refrescarContador, INTERVALO_POLLING_MS)

    // Cuando el Service Worker recibe un push real, avisa a todas las
    // pestañas abiertas (ver sw.js) — se refresca el contador de una vez en
    // vez de esperar hasta 45s a que llegue el próximo tick del polling.
    function alMensajeDelSW(event) {
      if (event.data?.type === 'SKYNET_PUSH_RECEIVED') refrescarContador()
    }
    navigator.serviceWorker?.addEventListener?.('message', alMensajeDelSW)

    function alRecuperarFoco() {
      if (document.visibilityState === 'visible') refrescarContador()
    }
    window.addEventListener('focus', alRecuperarFoco)
    document.addEventListener('visibilitychange', alRecuperarFoco)
    window.addEventListener(EVENTO_NOTIFICACIONES_ACTUALIZADAS, refrescarContador)

    return () => {
      clearInterval(id)
      navigator.serviceWorker?.removeEventListener?.('message', alMensajeDelSW)
      window.removeEventListener('focus', alRecuperarFoco)
      document.removeEventListener('visibilitychange', alRecuperarFoco)
      window.removeEventListener(EVENTO_NOTIFICACIONES_ACTUALIZADAS, refrescarContador)
    }
  }, [refrescarContador])

  return { noLeidas, notificaciones, cargando, cargarLista, marcarLeida, marcarTodasLeidas, refrescarContador }
}
