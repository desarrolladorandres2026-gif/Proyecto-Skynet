import { env } from '../../config/env.js'
import { procesarPendientes } from './notificaciones.service.js'

let temporizador = null

// Arrancado una vez desde index.js al iniciar el proceso (igual que
// sincronizarCatalogoSistema/sincronizarConfiguracionSLA). `enEjecucion`
// evita que un tick se solape con el anterior si procesar el lote tarda más
// que el intervalo (p. ej. el SMTP está lento respondiendo).
export function iniciarWorkerNotificaciones() {
  if (temporizador) return
  let enEjecucion = false

  temporizador = setInterval(async () => {
    if (enEjecucion) return
    enEjecucion = true
    try {
      await procesarPendientes(env.NOTIF_WORKER_LOTE)
    } catch (err) {
      console.error('Error procesando cola de notificaciones:', err.message)
    } finally {
      enEjecucion = false
    }
  }, env.NOTIF_WORKER_INTERVALO_MS)

  temporizador.unref?.()
}

export function detenerWorkerNotificaciones() {
  clearInterval(temporizador)
  temporizador = null
}
