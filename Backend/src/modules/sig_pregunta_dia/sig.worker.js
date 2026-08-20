import { env } from '../../config/env.js'
import { publicarPendientes } from './sig-programaciones.service.js'

let temporizador = null

// Arrancado una vez desde index.js (igual que
// notificaciones.worker.js/auditoria.worker.js). Es lo que hace que una
// pregunta programada se publique sola, a la hora exacta, sin que nadie
// tenga SkyNet abierto — `enEjecucion` evita que un tick se solape con el
// anterior si el lote tarda más que el intervalo.
export function iniciarWorkerSig() {
  if (temporizador) return
  let enEjecucion = false

  temporizador = setInterval(async () => {
    if (enEjecucion) return
    enEjecucion = true
    try {
      await publicarPendientes(env.SIG_WORKER_LOTE)
    } catch (err) {
      console.error('Error publicando preguntas SIG programadas:', err.message)
    } finally {
      enEjecucion = false
    }
  }, env.SIG_WORKER_INTERVALO_MS)

  temporizador.unref?.()
}

export function detenerWorkerSig() {
  clearInterval(temporizador)
  temporizador = null
}
