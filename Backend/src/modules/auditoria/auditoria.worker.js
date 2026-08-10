import { env } from '../../config/env.js'
import { purgarAntiguos } from './auditoria.service.js'

let temporizador = null

// Arrancado una vez desde index.js al iniciar el proceso (igual que
// iniciarWorkerNotificaciones). Corre una vez al arrancar y luego cada
// AUDITORIA_WORKER_INTERVALO_MS (24h por defecto), borrando los registros
// de auditoría con más de AUDITORIA_RETENCION_MESES meses de antigüedad
// (ventana móvil, no un vaciado total) para que la colección no crezca sin
// límite ni sature el listado paginado del panel.
export function iniciarWorkerAuditoria() {
  if (temporizador) return
  let enEjecucion = false

  const ejecutar = async () => {
    if (enEjecucion) return
    enEjecucion = true
    try {
      const eliminados = await purgarAntiguos()
      if (eliminados > 0) {
        console.log(`🧹  Auditoría: ${eliminados} registro(s) con más de ${env.AUDITORIA_RETENCION_MESES} meses eliminados.`)
      }
    } catch (err) {
      console.error('Error purgando registros de auditoría:', err.message)
    } finally {
      enEjecucion = false
    }
  }

  ejecutar()
  temporizador = setInterval(ejecutar, env.AUDITORIA_WORKER_INTERVALO_MS)
  temporizador.unref?.()
}

export function detenerWorkerAuditoria() {
  clearInterval(temporizador)
  temporizador = null
}
