import { env } from '../../config/env.js'
import { avisarRadicadosNuevos } from './radicados.avisos.js'

let temporizador = null

// Mismo patrón que plataforma.worker.js: un setInterval en el propio proceso.
// `enEjecucion` evita que dos vueltas se solapen si WordPress tarda más que el
// intervalo. Un fallo de WordPress (caído, credenciales) solo se registra: la
// siguiente vuelta lo reintenta sola y no pierde nada, porque la marca de
// "último radicado avisado" no avanza mientras la consulta falle.
export function iniciarWorkerRadicados() {
  if (temporizador) return
  let enEjecucion = false

  temporizador = setInterval(async () => {
    if (enEjecucion) return
    enEjecucion = true
    try {
      await avisarRadicadosNuevos()
    } catch (err) {
      console.error('Error avisando radicados nuevos del sitio web:', err.message)
    } finally {
      enEjecucion = false
    }
  }, env.RADICADOS_WORKER_INTERVALO_MS)

  temporizador.unref?.()
}

export function detenerWorkerRadicados() {
  clearInterval(temporizador)
  temporizador = null
}
