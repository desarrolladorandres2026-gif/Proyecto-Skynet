import { useState } from 'react'
import { usePushNotifications } from './usePushNotifications.js'

const CLAVE_DESCARTE = 'push-onboarding-descartado'

// El descarte dura solo la sesión del navegador (sessionStorage): con el
// descarte de 7 días anterior, un solo toque en "Más tarde" dejaba al usuario
// sin avisos y sin recordatorio — 75 de 90 usuarios terminaron sin ningún
// dispositivo suscrito. Ahora el aviso vuelve cada vez que abre la app.
function descartadoEnEstaSesion() {
  try {
    return sessionStorage.getItem(CLAVE_DESCARTE) === '1'
  } catch {
    return false
  }
}

function esIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

function esPwaInstalada() {
  return window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true
}

// Qué necesita hacer esta persona para recibir avisos:
//  - 'activar'  : puede activar ya con un toque.
//  - 'instalar' : iPhone/iPad en Safari — Apple solo da Push a la app
//                 instalada en la pantalla de inicio.
//  - 'bloqueado': negó el permiso; el navegador no vuelve a preguntar, hay
//                 que reactivarlo a mano en los ajustes del sitio.
//  - null       : ya está suscrito o el dispositivo no lo soporta.
export function usePushOnboarding() {
  const push = usePushNotifications()
  const [descartado, setDescartado] = useState(descartadoEnEstaSesion)

  function descartar() {
    try {
      sessionStorage.setItem(CLAVE_DESCARTE, '1')
    } catch {
      /* sin storage: solo se oculta hasta recargar */
    }
    setDescartado(true)
  }

  let modo = null
  if (!push.soportado) {
    if (esIOS() && !esPwaInstalada()) modo = 'instalar'
  } else if (push.suscrito === false) {
    modo = push.permiso === 'denied' ? 'bloqueado' : 'activar'
  }
  // push.suscrito arranca en null mientras se consulta el SW — no mostrar
  // nada hasta saberlo, o parpadearía en cada carga.

  return { visible: modo !== null && !descartado, modo, push, descartar }
}
