import { useEffect, useState } from 'react'

const CLAVE_DESCARTE = 'pwa-instalacion-descartada'
const DIAS_REAPARICION = 7

// La app ya corre instalada (ícono propio, sin barra del navegador).
function enModoApp() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  )
}

// Safari en iOS no emite beforeinstallprompt: la instalación solo puede
// hacerla el usuario desde Compartir → "Añadir a pantalla de inicio".
// iPadOS 13+ se reporta como Macintosh, pero con pantalla táctil.
function esDispositivoIos() {
  const ua = window.navigator.userAgent
  if (/iphone|ipad|ipod/i.test(ua)) return true
  return ua.includes('Macintosh') && window.navigator.maxTouchPoints > 1
}

function descartadaRecientemente() {
  const valor = localStorage.getItem(CLAVE_DESCARTE)
  if (!valor) return false
  const descartadaEn = Number(valor)
  return (
    Number.isFinite(descartadaEn) &&
    Date.now() - descartadaEn < DIAS_REAPARICION * 24 * 60 * 60 * 1000
  )
}

export function usePwaInstall() {
  const [eventoInstalacion, setEventoInstalacion] = useState(null)
  const [instalada, setInstalada] = useState(enModoApp)
  const [descartada, setDescartada] = useState(descartadaRecientemente)

  useEffect(() => {
    function onBeforeInstallPrompt(e) {
      // Evita el mini-infobar automático de Chrome: el prompt nativo se
      // dispara solo cuando el usuario toca nuestro botón "Instalar".
      e.preventDefault()
      setEventoInstalacion(e)
    }
    function onAppInstalled() {
      setInstalada(true)
      setEventoInstalacion(null)
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    window.addEventListener('appinstalled', onAppInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
      window.removeEventListener('appinstalled', onAppInstalled)
    }
  }, [])

  async function instalar() {
    if (!eventoInstalacion) return
    eventoInstalacion.prompt()
    const { outcome } = await eventoInstalacion.userChoice
    // El evento solo sirve una vez: aceptado o rechazado, se descarta.
    setEventoInstalacion(null)
    if (outcome !== 'accepted') descartar()
  }

  function descartar() {
    localStorage.setItem(CLAVE_DESCARTE, String(Date.now()))
    setDescartada(true)
  }

  const iosSinInstalar = esDispositivoIos() && !instalada

  return {
    visible: !instalada && !descartada && (Boolean(eventoInstalacion) || iosSinInstalar),
    // En iOS no hay prompt: el banner muestra las instrucciones manuales.
    esIos: iosSinInstalar && !eventoInstalacion,
    instalar,
    descartar,
  }
}
