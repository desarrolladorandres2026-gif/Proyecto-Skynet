import { env } from '../../config/env.js'
import { evaluarTransiciones } from './plataforma.service.js'

let temporizador = null

// Mismo patrón que notificaciones.worker.js / sig.worker.js: un setInterval en
// el propio proceso, sin infraestructura adicional (no hay node-cron ni Redis
// en el proyecto, y a esta escala no hacen falta).
//
// La diferencia importante con esos dos: aquí el worker NO es la autoridad
// sobre la hora. derivarEstado() en el service ya bloquea/desbloquea al
// segundo exacto en cada lectura; este temporizador solo PERSISTE la
// transición, la registra en el historial y dispara la notificación. Si el
// worker se atrasa o muere, el mantenimiento sigue aplicándose correctamente
// — solo se retrasarían el aviso y el registro.
//
// `enEjecucion` evita que dos ticks se solapen si un envío de notificaciones
// tarda más que el intervalo; el CAS de cada transición ya lo cubriría, pero
// no hay motivo para hacer trabajo duplicado.
export function iniciarWorkerPlataforma() {
  if (temporizador) return
  let enEjecucion = false

  temporizador = setInterval(async () => {
    if (enEjecucion) return
    enEjecucion = true
    try {
      await evaluarTransiciones()
    } catch (err) {
      console.error('Error evaluando transiciones de mantenimiento:', err.message)
    } finally {
      enEjecucion = false
    }
  }, env.PLATAFORMA_WORKER_INTERVALO_MS)

  temporizador.unref?.()
}

export function detenerWorkerPlataforma() {
  clearInterval(temporizador)
  temporizador = null
}
