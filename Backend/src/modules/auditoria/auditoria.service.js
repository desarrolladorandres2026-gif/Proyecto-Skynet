import * as repo from './auditoria.repository.js'
import { ErrorValidacion, ErrorNoEncontrado } from '../../utils/errores.js'
import { registrarAuditoria } from '../../utils/auditoria.js'
import { escapeRegex } from '../../utils/regex.js'
import { inicioDelDia, instanteLocal, restarMeses } from '../../utils/fechas.js'
import { env } from '../../config/env.js'
import mongoose from 'mongoose'

const LIMITE_MAX = 100
const LIMITE_DEFECTO = 20
const RESULTADOS_VALIDOS = ['exito', 'error']
// Tope duro del lote: una eliminación masiva sigue siendo una operación
// puntual desde el panel, no un reemplazo de la purga por retención
// (purgarAntiguos, sin límite porque corre en segundo plano) — un número
// grande de golpe casi siempre es un clic accidental de "seleccionar todo".
const LOTE_MAX = 500

function construirFiltro({ modulo, usuario, accion, desde, hasta, resultado }) {
  const filtro = {}

  // Todos los parámetros de filtro deben ser string: bloquea que un operador
  // NoSQL (p. ej. {"modulo":{"$ne":null}}) llegue vía query string.
  if (modulo !== undefined) {
    if (typeof modulo !== 'string') throw new ErrorValidacion('modulo inválido')
    filtro.modulo = modulo
  }
  if (usuario !== undefined) {
    if (typeof usuario !== 'string') throw new ErrorValidacion('usuario inválido')
    // Búsqueda por nombre (usuarioNombre, desnormalizado — ver
    // RegistroAuditoria.js), no por ObjectId: el panel nunca tuvo forma de
    // conocer el id de quien hizo la acción, solo su nombre visible en la
    // columna "Usuario".
    filtro.usuarioNombre = { $regex: escapeRegex(usuario.trim()), $options: 'i' }
  }
  if (accion !== undefined) {
    if (typeof accion !== 'string') throw new ErrorValidacion('accion inválida')
    filtro.accion = accion
  }
  if (resultado !== undefined) {
    if (!RESULTADOS_VALIDOS.includes(resultado)) throw new ErrorValidacion('resultado inválido')
    filtro.resultado = resultado
  }
  if (desde !== undefined || hasta !== undefined) {
    filtro.creadoEn = construirRangoCreadoEn(desde, hasta)
  }

  return filtro
}

// Los límites se anclan a la medianoche del Terminal (ver utils/fechas.js), no
// a la de UTC ni a la de la zona del proceso Node.
//
// Antes esto hacía `new Date('2026-08-13')` (medianoche UTC) y luego
// `setHours(23,59,59,999)` (zona del PROCESO): en el VPS, que corre en UTC, el
// límite superior caía a las 6:59 p.m. hora de Neiva. El Terminal opera 24/7,
// así que TODO lo que hacía el turno de la noche desaparecía del filtro de ese
// día sin ningún aviso — omisión silenciosa en el módulo cuyo propósito es
// justamente la trazabilidad. Ver BUG-005 en la auditoría 2026-08-13.
function construirRangoCreadoEn(desde, hasta) {
  const rango = {}

  if (desde !== undefined) {
    if (typeof desde !== 'string') throw new ErrorValidacion('desde inválido')
    // Con hora explícita (<input type="datetime-local">) se respeta el
    // instante que representa en el Terminal; sin ella, se ancla al inicio de
    // ese día. instanteLocal() existe porque un ISO sin offset se interpreta
    // en la zona del PROCESO Node por spec, no en la de Neiva.
    const fecha = desde.includes('T') ? instanteLocal(desde) : inicioDelDia(desde)
    if (!fecha || Number.isNaN(fecha.getTime())) throw new ErrorValidacion('desde no es una fecha válida')
    rango.$gte = fecha
  }

  if (hasta !== undefined) {
    if (typeof hasta !== 'string') throw new ErrorValidacion('hasta inválido')
    if (hasta.includes('T')) {
      // Instante exacto: $lte, porque el usuario eligió ese minuto a propósito.
      const fecha = instanteLocal(hasta)
      if (Number.isNaN(fecha.getTime())) throw new ErrorValidacion('hasta no es una fecha válida')
      rango.$lte = fecha
    } else {
      // Día completo: $lt del inicio del día SIGUIENTE, para que no se escape
      // nada por el borde de los milisegundos.
      const inicioHasta = inicioDelDia(hasta)
      if (!inicioHasta) throw new ErrorValidacion('hasta no es una fecha válida')
      rango.$lt = new Date(inicioHasta.getTime() + 24 * 60 * 60 * 1000)
    }
  }

  return rango
}

export async function listarAuditoria(query) {
  const filtro = construirFiltro(query)
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1)
  const limit = Math.min(LIMITE_MAX, Math.max(1, Number.parseInt(query.limit, 10) || LIMITE_DEFECTO))

  const { registros, total } = await repo.listarPaginado(filtro, { page, limit })

  return { registros, total, page, pages: Math.ceil(total / limit) || 1 }
}

// Alimenta los selects de "Módulo" y "Acción" del panel con los valores que
// de verdad existen en la colección (en vez de una lista fija a mano que se
// desactualiza cada vez que se agrega un módulo nuevo al ERP).
export async function obtenerFiltrosDisponibles() {
  const [modulos, acciones] = await Promise.all([repo.distintosModulos(), repo.distintosAcciones()])
  return { modulos: modulos.sort(), acciones: acciones.sort() }
}

// Eliminación individual, exclusiva de Super Admin (ver auditoria.routes.js,
// gate soloAdmin — no un permiso RBAC delegable: borrar el rastro de
// auditoría es demasiado sensible para dejarlo abierto a "quien tenga el
// permiso"). Deja su propia entrada de auditoría describiendo QUÉ se borró,
// para que la eliminación misma quede trazada aunque el registro original ya
// no exista — mismo criterio que la purga masiva de purga.service.js.
export async function eliminarRegistro(id, usuarioActor) {
  const registro = await repo.obtenerPorId(id)
  if (!registro) throw new ErrorNoEncontrado('Registro de auditoría no encontrado')

  await repo.eliminarPorId(id)

  await registrarAuditoria({
    usuario: usuarioActor,
    accion: 'eliminar',
    modulo: 'auditoria',
    entidad: 'RegistroAuditoria',
    entidadId: registro._id,
    descripcion: `Registro de auditoría eliminado: [${registro.modulo}/${registro.accion}] ${registro.descripcion || ''} (${registro.usuarioNombre}, ${registro.creadoEn.toISOString()})`,
    cambios: { antes: registro.toObject(), despues: null },
  })
}

// Eliminación en lote, personalizable: el Super Admin elige exactamente qué
// registros (checkbox por checkbox, tantos como quiera) desde el panel — a
// diferencia de eliminarRegistro (uno) y purgarAntiguos (todo lo viejo por
// fecha, automático). Mismo gate soloAdmin, misma auditoría-de-la-auditoría
// que la eliminación individual, pero UNA sola entrada resumen (no una por
// registro) para no inundar el propio log con la eliminación en sí.
export async function eliminarRegistrosMasivo(ids, usuarioActor) {
  if (!Array.isArray(ids) || ids.length === 0) {
    throw new ErrorValidacion('Selecciona al menos un registro para eliminar')
  }
  if (ids.length > LOTE_MAX) {
    throw new ErrorValidacion(`No se pueden eliminar más de ${LOTE_MAX} registros de una vez`)
  }
  const idsInvalidos = ids.filter((id) => typeof id !== 'string' || !mongoose.Types.ObjectId.isValid(id))
  if (idsInvalidos.length > 0) {
    throw new ErrorValidacion('Uno o más identificadores no son válidos')
  }

  const registros = await repo.obtenerPorIds(ids)
  if (registros.length === 0) {
    throw new ErrorNoEncontrado('Ninguno de los registros seleccionados existe')
  }

  const eliminados = await repo.eliminarPorIds(ids)

  const resumenModulos = [...new Set(registros.map((r) => r.modulo))].join(', ')
  await registrarAuditoria({
    usuario: usuarioActor,
    accion: 'eliminar_lote',
    modulo: 'auditoria',
    entidad: 'RegistroAuditoria',
    descripcion: `${eliminados} registro(s) de auditoría eliminados en lote (módulos: ${resumenModulos})`,
    cambios: {
      antes: { total: eliminados, ids: registros.map((r) => r._id) },
      despues: null,
    },
  })

  return { eliminados }
}

// Llamado periódicamente por auditoria.worker.js. Borra solo lo anterior a
// la ventana de retención (ventana móvil, no un vaciado total) para que la
// colección no crezca sin límite ni sature el listado paginado del panel.
export async function purgarAntiguos() {
  // restarMeses en vez de setMonth: `new Date('2026-05-31').setMonth(mes - 3)`
  // devuelve el 3 de MARZO (el 31 de febrero no existe y JS corre la fecha
  // hacia adelante), así que los días 29, 30 y 31 de cada mes esto borraba
  // hasta tres días de historial MÁS de lo que la política de retención
  // declara. Ver BUG-012 en la auditoría 2026-08-13.
  const fechaLimite = restarMeses(new Date(), env.AUDITORIA_RETENCION_MESES)
  return repo.eliminarAnteriores(fechaLimite)
}
