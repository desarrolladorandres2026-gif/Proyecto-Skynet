import * as repo from './auditoria.repository.js'
import { ErrorValidacion } from '../../utils/errores.js'
import { env } from '../../config/env.js'

const LIMITE_MAX = 100
const LIMITE_DEFECTO = 20

function construirFiltro({ modulo, usuario, accion, desde, hasta }) {
  const filtro = {}

  // Todos los parámetros de filtro deben ser string: bloquea que un operador
  // NoSQL (p. ej. {"modulo":{"$ne":null}}) llegue vía query string.
  if (modulo !== undefined) {
    if (typeof modulo !== 'string') throw new ErrorValidacion('modulo inválido')
    filtro.modulo = modulo
  }
  if (usuario !== undefined) {
    if (typeof usuario !== 'string') throw new ErrorValidacion('usuario inválido')
    filtro.usuario = usuario
  }
  if (accion !== undefined) {
    if (typeof accion !== 'string') throw new ErrorValidacion('accion inválida')
    filtro.accion = accion
  }
  if (desde !== undefined || hasta !== undefined) {
    filtro.creadoEn = {}
    if (desde !== undefined) {
      if (typeof desde !== 'string') throw new ErrorValidacion('desde inválido')
      const fecha = new Date(desde)
      if (Number.isNaN(fecha.getTime())) throw new ErrorValidacion('desde no es una fecha válida')
      filtro.creadoEn.$gte = fecha
    }
    if (hasta !== undefined) {
      if (typeof hasta !== 'string') throw new ErrorValidacion('hasta inválido')
      const fecha = new Date(hasta)
      if (Number.isNaN(fecha.getTime())) throw new ErrorValidacion('hasta no es una fecha válida')
      filtro.creadoEn.$lte = fecha
    }
  }

  return filtro
}

export async function listarAuditoria(query) {
  const filtro = construirFiltro(query)
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1)
  const limit = Math.min(LIMITE_MAX, Math.max(1, Number.parseInt(query.limit, 10) || LIMITE_DEFECTO))

  const { registros, total } = await repo.listarPaginado(filtro, { page, limit })

  return { registros, total, page, pages: Math.ceil(total / limit) || 1 }
}

// Llamado periódicamente por auditoria.worker.js. Borra solo lo anterior a
// la ventana de retención (ventana móvil, no un vaciado total) para que la
// colección no crezca sin límite ni sature el listado paginado del panel.
export async function purgarAntiguos() {
  const fechaLimite = new Date()
  fechaLimite.setMonth(fechaLimite.getMonth() - env.AUDITORIA_RETENCION_MESES)
  return repo.eliminarAnteriores(fechaLimite)
}
