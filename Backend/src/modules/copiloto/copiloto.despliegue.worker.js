import { env } from '../../config/env.js'
import { procesarPruebasPendientes } from './copiloto.despliegue.js'

// Worker de la prueba de comunicaciones. Mismo patrón, deliberadamente, que
// notificaciones.worker.js y auditoria.worker.js: un setInterval dentro del
// mismo proceso Node, con guardia contra solapamiento y unref(). No hay
// Redis ni BullMQ en este proyecto y esto no justifica introducirlos — el
// volumen es "un lote de unas decenas de correos, alguna vez al día".
//
// El trabajo en sí vive en Mongo (RegistroDespliegue), no en memoria: si el
// proceso se reinicia a mitad del lote, el trabajo sigue ahí y se retoma
// donde iba (ver procesarTrabajo en copiloto.despliegue.js).

let temporizador = null
let enEjecucion = false

// Extraída para poder invocarla tanto desde el temporizador como desde el
// "empujón" de abajo. La guardia `enEjecucion` es la que garantiza que el
// empujón y un tick del temporizador no puedan procesar el mismo trabajo a la
// vez — además del compare-and-swap de reclamarTrabajo(), que lo impide
// incluso entre procesos distintos.
async function ciclo() {
  if (enEjecucion) return
  enEjecucion = true
  try {
    await procesarPruebasPendientes()
  } catch (err) {
    console.error('Error procesando la cola de pruebas de comunicaciones:', err.message)
  } finally {
    enEjecucion = false
  }
}

export function iniciarWorkerDespliegue() {
  if (temporizador) return
  temporizador = setInterval(ciclo, env.DESPLIEGUE_WORKER_INTERVALO_MS)
  temporizador.unref?.()
}

export function detenerWorkerDespliegue() {
  clearInterval(temporizador)
  temporizador = null
}

/**
 * Arranca un ciclo YA, sin esperar al siguiente tick.
 *
 * Es una optimización de percepción, no de corrección: sin esto todo
 * funcionaría igual, solo que el envío empezaría hasta
 * DESPLIEGUE_WORKER_INTERVALO_MS después de pedirlo. Se llama en modo
 * "dispara y olvida" desde la herramienta del copiloto (ver
 * copiloto.herramientas.js) JUSTO DESPUÉS de encolar, para que la respuesta
 * de /chat no espere nada y el lote arranque igualmente en el acto.
 *
 * El .catch() no es decorativo: sin él, un fallo aquí sería una promesa
 * rechazada sin dueño dentro de una petición HTTP que ya respondió.
 */
export function despertarWorkerDespliegue() {
  ciclo().catch((err) => {
    console.error('Error en el ciclo inmediato de pruebas de comunicaciones:', err.message)
  })
}
