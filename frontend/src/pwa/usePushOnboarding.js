import { useState } from 'react'
import { usePushNotifications } from './usePushNotifications.js'

const CLAVE_DESCARTE = 'push-onboarding-descartado'
const DIAS_REAPARICION = 7

// Mismo criterio de "descarte con reaparición" que usePwaInstall.js: si el
// usuario cierra el aviso, no se le vuelve a mostrar en cada página — solo
// pasados unos días, no en cada sesión.
function descartadoRecientemente() {
  const valor = localStorage.getItem(CLAVE_DESCARTE)
  if (!valor) return false
  const descartadoEn = Number(valor)
  return Number.isFinite(descartadoEn) && Date.now() - descartadoEn < DIAS_REAPARICION * 24 * 60 * 60 * 1000
}

// Decide si mostrar el banner "Activa las notificaciones" después de
// iniciar sesión. En iOS, usePushNotifications ya reporta `soportado:false`
// en Safari normal (Push API solo existe una vez instalada como PWA) — así
// que este banner aparece solo tras instalar, sin necesitar lógica aparte
// para detectarlo. En Android/escritorio no hace falta estar instalado: el
// push funciona igual en una pestaña normal.
export function usePushOnboarding() {
  const push = usePushNotifications()
  const [descartado, setDescartado] = useState(descartadoRecientemente)

  function descartar() {
    localStorage.setItem(CLAVE_DESCARTE, String(Date.now()))
    setDescartado(true)
  }

  return {
    // push.suscrito arranca en null mientras se consulta
    // navigator.serviceWorker.ready — no mostrar el banner hasta saber de
    // verdad si ya está suscrito, o parpadearía en cada carga.
    visible: push.soportado && push.suscrito === false && push.permiso !== 'denied' && !descartado,
    push,
    descartar,
  }
}
