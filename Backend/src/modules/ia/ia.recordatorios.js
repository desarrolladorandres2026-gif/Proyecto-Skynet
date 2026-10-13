import PreferenciaIA from '../../models/PreferenciaIA.js'
import { calcularResumen } from '../operacion/dashboard.service.js'
import { destinosDisponibles } from '../copiloto/copiloto.navegacion.js'
import { recordatorioPendientes } from '../copiloto/copiloto.respuestas.js'
import { estaModuloActivo } from '../sistema/sistema.service.js'

// Recordatorios proactivos: Skynet le dice al usuario, sin que pregunte, qué
// trabajo suyo está esperando. A diferencia de los avisos (AvisoIA), que
// reaccionan a UN evento, esto mira el estado acumulado.
//
// Reglas que lo mantienen útil en vez de molesto:
//  - Solo habla si hay trabajo ACCIONABLE. Silencio cuando todo está al día:
//    un asistente que dice "nada pendiente" cada dos horas se aprende a
//    ignorar, y con él se ignoran también los recordatorios que sí importan.
//  - Como mucho uno cada INTERVALO_MS por usuario, sin importar cuántas
//    pestañas o dispositivos tenga abiertos (el reloj vive en PreferenciaIA).
//  - Lo cuenta solo de lo que el usuario puede hacer: reutiliza
//    calcularResumen, que ya filtra por permiso y módulo activo.

export const INTERVALO_MS = 2 * 60 * 60 * 1000

// Tarjeta del dashboard -> a dónde llevar al usuario para atenderla. Cada
// tarjeta lista varios destinos candidatos en orden de preferencia: el mismo
// contador significa cosas distintas según el rol (para Financiero son
// requerimientos por APROBAR; para un supervisor, requerimientos en curso), y
// el botón tiene que abrir la pantalla donde ese usuario realmente actúa.
//
// Quedan fuera a propósito `misDanosReportados` (es un estado, no una tarea)
// y `notificaciones` (la campana ya las muestra y el aviso de cada una ya se
// habló cuando llegó).
const PENDIENTES = [
  { tarjeta: 'requerimientosPendientes', destinos: ['requerimientos_financiero', 'requerimientos_todos'] },
  { tarjeta: 'requerimientosPorDespachar', destinos: ['requerimientos_bodega'] },
  { tarjeta: 'ausenciasPendientes', destinos: ['ausencias_bandeja', 'ausencias_calendario'] },
  { tarjeta: 'danosPendientes', destinos: ['danos_tareas'] },
  { tarjeta: 'misTareasMantenimiento', destinos: ['danos_mis_tareas'] },
  { tarjeta: 'mantenimientoAbiertas', destinos: ['ordenes_trabajo'] },
]

// Más botones que esto convierte el recordatorio en un menú.
const MAX_ACCIONES = 3

/**
 * Función pura: arma el recordatorio a partir de los contadores y de los
 * destinos que el usuario puede abrir. Devuelve null si no hay nada que hacer.
 *
 * @param {{tarjetas: object, destinos: Array<{ruta: string, clave: string, titulo: string}>, nombre?: string}} datos
 */
export function armarRecordatorio({ tarjetas, destinos, nombre }) {
  const porClave = new Map(destinos.map((d) => [d.clave, d]))
  const incluidas = {}
  const acciones = []

  for (const { tarjeta, destinos: candidatos } of PENDIENTES) {
    const n = tarjetas?.[tarjeta]
    if (typeof n !== 'number' || n <= 0) continue
    incluidas[tarjeta] = n

    const destino = candidatos.map((c) => porClave.get(c)).find(Boolean)
    if (destino && !acciones.some((a) => a.ruta === destino.ruta)) {
      acciones.push({ etiqueta: destino.titulo, ruta: destino.ruta })
    }
  }

  if (!Object.keys(incluidas).length) return null
  return { texto: recordatorioPendientes(nombre, incluidas), acciones: acciones.slice(0, MAX_ACCIONES) }
}

/** ¿Ya pasó el intervalo desde el último recordatorio? */
export function haPasadoElIntervalo(ultimoEn, ahora = new Date()) {
  if (!ultimoEn) return true
  return ahora.getTime() - new Date(ultimoEn).getTime() >= INTERVALO_MS
}

/**
 * Devuelve el recordatorio que toca decirle ahora a este usuario, o null.
 * Llamarlo CONSUME el turno: quien recibe un recordatorio no vuelve a recibir
 * otro hasta dentro de INTERVALO_MS, aunque lo pida desde otra pestaña.
 */
export async function obtenerRecordatorio(usuario, ahora = new Date()) {
  const usuarioId = usuario.id_usuario

  // El widget solo existe con el módulo copiloto encendido; sin él no hay
  // dónde mostrar ni decir nada, y reclamar el turno lo gastaría en vano.
  if (!(await estaModuloActivo('copiloto'))) return null

  // Chequeo barato primero (una lectura): casi todas las llamadas terminan
  // aquí, y solo las que de verdad tocan pagan las consultas de conteo.
  const pref = await PreferenciaIA.findOne({ usuario: usuarioId }).select('recordatorios ultimoRecordatorioEn').lean()
  if (pref?.recordatorios?.activo === false) return null
  if (!haPasadoElIntervalo(pref?.ultimoRecordatorioEn, ahora)) return null

  const [{ tarjetas }, destinos] = await Promise.all([
    calcularResumen(usuario, { soloTarjetas: true }),
    destinosDisponibles(usuario),
  ])
  const recordatorio = armarRecordatorio({ tarjetas, destinos, nombre: usuario.nombre_usuario })
  if (!recordatorio) return null // nada que hacer: NO se gasta el turno

  // Reclamo atómico del turno. Si dos pestañas llegan a la vez, ambas pasaron
  // el chequeo de arriba; el filtro de aquí deja ganar a una sola. La otra
  // intenta insertar un documento duplicado (índice único de `usuario`) y se
  // va con null.
  try {
    await PreferenciaIA.findOneAndUpdate(
      {
        usuario: usuarioId,
        $or: [{ ultimoRecordatorioEn: null }, { ultimoRecordatorioEn: { $lte: new Date(ahora.getTime() - INTERVALO_MS) } }],
      },
      { $set: { ultimoRecordatorioEn: ahora } },
      { upsert: true, setDefaultsOnInsert: true }
    )
  } catch (err) {
    if (err?.code === 11000) return null
    throw err
  }

  return recordatorio
}
