/**
 * Manejador del Splash Screen cinematográfico de Skynet.
 * Garantiza un tiempo mínimo de presentación (~2.3s) para que el usuario aprecie
 * la secuencia épica de telemetría e inicialización antes de realizar la transición suave.
 */
let splashOcultado = false
let appLista = false
const TIEMPO_MINIMO_SPLASH_MS = 2200
const tiempoInicio = typeof performance !== 'undefined' ? performance.now() : Date.now()

export function ocultarSplashScreen() {
  appLista = true

  const tiempoTranscurrido = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - tiempoInicio
  const tiempoRestante = Math.max(0, TIEMPO_MINIMO_SPLASH_MS - tiempoTranscurrido)

  setTimeout(() => {
    ejecutarSalida()
  }, tiempoRestante)
}

function ejecutarSalida() {
  if (splashOcultado) return
  splashOcultado = true

  const splash = document.getElementById('skynet-splash')
  if (!splash) return

  // Señalizar al splash que el sistema está 100% listo
  const statusEl = document.getElementById('skynet-splash-status')
  const percentEl = document.getElementById('skynet-splash-percent')
  const progressFill = document.getElementById('skynet-splash-bar-fill')

  if (statusEl) statusEl.textContent = 'SISTEMA ONLINE // BIENVENIDO'
  if (percentEl) percentEl.textContent = '100%'
  if (progressFill) progressFill.style.transform = 'translate3d(0%, 0, 0)'

  // Breve destello final antes de la transición de salida
  setTimeout(() => {
    splash.classList.add('skynet-splash-fadeout')

    // Eliminar del DOM para liberar recursos de la GPU en móviles
    setTimeout(() => {
      try {
        splash.remove()
      } catch {
        // Ignorar
      }
    }, 500)
  }, 250)
}

// Fallback de seguridad por si alguna red lenta demora más de la cuenta
if (typeof window !== 'undefined') {
  setTimeout(() => {
    ejecutarSalida()
  }, 4500)
}
