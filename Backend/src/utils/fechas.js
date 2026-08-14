import { ErrorValidacion } from './errores.js'

// Punto único de verdad para convertir "un día que el usuario eligió en un
// <input type=\"date\">" en instantes de Mongo.
//
// ── El problema que resuelve ────────────────────────────────────────────────
// Había tres implementaciones distintas del mismo cálculo, y dos estaban mal:
//
//   new Date('2026-08-13')            -> 2026-08-13T00:00:00Z  (medianoche UTC)
//   ...seguido de setHours(0,0,0,0)   -> medianoche en la zona del PROCESO Node
//
// Mezclar ambas hace que el resultado dependa de la variable TZ del servidor,
// que nadie fija a propósito y que cambia si alguien "arregla las fechas" en
// el VPS. Con TZ=America/Bogota, `aDia('2026-08-20')` guardaba el día 19.
//
// ── Por qué la zona del Terminal y no UTC ───────────────────────────────────
// Usar UTC quita la fragilidad pero no acierta: cuando alguien filtra "hasta
// el 13 de agosto" quiere decir el 13 de agosto EN NEIVA. Con límites en UTC,
// ese rango se corta a las 6:59 p.m. hora local y se pierde todo lo que hizo
// el turno de la noche — y el Terminal opera 24/7.
//
// Colombia no aplica horario de verano desde 1993 y su offset es fijo en
// -05:00, así que basta con anclar el literal: no hace falta Intl ni una
// librería de zonas horarias. Si algún día la plataforma sirve a otro país,
// este es el único punto que hay que cambiar.
export const OFFSET_TERMINAL = '-05:00'

const DIA_RE = /^\d{4}-\d{2}-\d{2}$/
const MS_POR_DIA = 24 * 60 * 60 * 1000

// Acepta "YYYY-MM-DD" (lo que manda un <input type="date">) o un Date/ISO
// completo, del que se toma el día tal como se ve en la zona del Terminal.
function aTextoDeDia(valor) {
  if (typeof valor === 'string' && DIA_RE.test(valor)) return valor

  const fecha = valor instanceof Date ? valor : new Date(valor)
  if (Number.isNaN(fecha.getTime())) return null
  // 'en-CA' produce exactamente "YYYY-MM-DD"; con timeZone explícito devuelve
  // el día como se ve en Neiva, no como se ve en la zona del proceso.
  return fecha.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
}

/**
 * Instante en que empieza ese día en el Terminal.
 * "2026-08-20" -> 2026-08-20T05:00:00.000Z
 *
 * Es también la forma canónica de guardar una fecha que representa un DÍA y no
 * un instante (Ausencia.fechaInicio/fechaFin): guardada así, el frontend la
 * pinta con el día correcto sin necesitar ningún formateador especial, porque
 * `toLocaleDateString('es-CO')` en un navegador de Colombia devuelve ese mismo
 * día, y `toISOString().slice(0,10)` (que usa aInputFecha) también.
 */
export function inicioDelDia(valor) {
  const dia = aTextoDeDia(valor)
  if (!dia) return null
  const fecha = new Date(`${dia}T00:00:00.000${OFFSET_TERMINAL}`)
  return Number.isNaN(fecha.getTime()) ? null : fecha
}

/** El día de hoy en el Terminal, a las 00:00. */
export function hoy() {
  return inicioDelDia(new Date())
}

// "YYYY-MM-DDTHH:mm" o "YYYY-MM-DDTHH:mm:ss" — lo que produce un
// <input type="datetime-local">, sin offset de zona.
const DATETIME_SIN_OFFSET_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/

/**
 * Convierte un valor de <input type="datetime-local"> al instante que
 * representa en el Terminal.
 *
 * El propio spec de JavaScript dice que un ISO-8601 SIN offset ("2026-08-13T
 * 14:31") se interpreta en la zona horaria LOCAL DEL PROCESO que ejecuta el
 * motor — no en la del navegador que originó el valor. Un `new Date(valor)`
 * directo sobre esa cadena da un resultado distinto según dónde corra el
 * servidor: 14:31 se volvía 14:31 UTC en el VPS, en vez de 14:31 hora de
 * Neiva (19:31 UTC). Si SÍ trae offset ("...Z", "...+05:00") se respeta tal
 * cual, porque ahí el instante ya está determinado sin ambigüedad.
 */
export function instanteLocal(valor) {
  if (typeof valor !== 'string') return null
  const fecha = new Date(DATETIME_SIN_OFFSET_RE.test(valor) ? `${valor}${OFFSET_TERMINAL}` : valor)
  return Number.isNaN(fecha.getTime()) ? null : fecha
}

/**
 * Rango [desde, hasta] con AMBOS extremos inclusivos, listo para un filtro de
 * Mongo: `{ creadoEn: rangoDeDias('2026-08-01', '2026-08-13') }`.
 *
 * El límite superior es `$lt` del día siguiente en vez de `$lte` de las
 * 23:59:59.999: así no hay milisegundos que se escapen por el borde ni
 * suposiciones sobre la precisión con que Mongo guardó el timestamp.
 */
export function rangoDeDias(desde, hasta) {
  if (!desde || !hasta) throw new ErrorValidacion('Debes indicar fecha de inicio y fecha de fin')

  const inicio = inicioDelDia(desde)
  const inicioHasta = inicioDelDia(hasta)
  if (!inicio || !inicioHasta) throw new ErrorValidacion('Las fechas no son válidas')

  const finExclusivo = new Date(inicioHasta.getTime() + MS_POR_DIA)
  if (inicio >= finExclusivo) {
    throw new ErrorValidacion('La fecha de inicio no puede ser posterior a la de fin')
  }
  return { $gte: inicio, $lt: finExclusivo }
}

/**
 * Días naturales entre dos fechas, ambos extremos incluidos.
 * Opera sobre los DÍAS, no sobre los instantes, así que da lo mismo a qué hora
 * se hayan guardado los dos valores.
 */
export function contarDias(inicio, fin) {
  const a = inicioDelDia(inicio)
  const b = inicioDelDia(fin)
  if (!a || !b) return 0
  return Math.round((b.getTime() - a.getTime()) / MS_POR_DIA) + 1
}

/**
 * Resta meses sin el desbordamiento de `setMonth`.
 *
 * `new Date('2026-05-31').setMonth(mes - 3)` produce el 3 de MARZO, no el 28
 * de febrero: el 31 de febrero no existe y JavaScript lo "arregla" corriendo
 * la fecha hacia adelante. En la purga por retención eso significaba borrar
 * hasta tres días de historial de más los días 29, 30 y 31 de cada mes.
 *
 * Aquí se fija el día al 1 antes de mover el mes y luego se recorta el día al
 * último válido del mes destino.
 */
export function restarMeses(fecha, meses) {
  const base = fecha instanceof Date ? new Date(fecha.getTime()) : new Date(fecha)
  if (Number.isNaN(base.getTime())) return null

  const dia = base.getUTCDate()
  const resultado = new Date(base.getTime())
  resultado.setUTCDate(1)
  resultado.setUTCMonth(resultado.getUTCMonth() - meses)

  // Día 0 del mes SIGUIENTE = último día del mes actual.
  const ultimoDiaDelMes = new Date(
    Date.UTC(resultado.getUTCFullYear(), resultado.getUTCMonth() + 1, 0)
  ).getUTCDate()
  resultado.setUTCDate(Math.min(dia, ultimoDiaDelMes))
  return resultado
}
