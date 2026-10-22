import { obtenerResumen } from './resumen.service.js'
import { listarMedios, subirMedio } from './medios.service.js'
import { listarEventos, obtenerEvento, listarSedes, crearEvento, actualizarEvento, eliminarEvento } from './eventos.service.js'
import { listarAvisos, obtenerAviso, crearAviso, actualizarAviso, eliminarAviso } from './avisos.service.js'
import { ErrorValidacion } from '../../utils/errores.js'

export function parsearId(valor) {
  const id = Number(valor)
  if (!Number.isInteger(id) || id <= 0) throw new ErrorValidacion('Identificador inválido')
  return id
}

function paginacion(query, maximo = 50) {
  return {
    page: Math.max(1, Number(query.page) || 1),
    limit: Math.min(maximo, Math.max(1, Number(query.limit) || 20)),
  }
}

const textoBusqueda = (valor) => (typeof valor === 'string' ? valor.trim().slice(0, 100) || undefined : undefined)

export async function resumen(_req, res) {
  res.json(await obtenerResumen())
}

// ── Medios ────────────────────────────────────────────────────────────────
export async function medios(req, res) {
  res.json(await listarMedios({ ...paginacion(req.query, 60), buscar: textoBusqueda(req.query.buscar) }))
}

export async function subirImagen(req, res) {
  const medio = await subirMedio(req.file, { alt: req.body?.alt }, req.usuario, req.ip)
  res.status(201).json({ medio })
}

// ── Eventos ───────────────────────────────────────────────────────────────
export async function eventosListar(req, res) {
  res.json(
    await listarEventos({
      ...paginacion(req.query, 24),
      buscar: textoBusqueda(req.query.buscar),
      estado: req.query.estado,
    }),
  )
}
export async function eventosObtener(req, res) {
  res.json({ evento: await obtenerEvento(parsearId(req.params.id)) })
}
export async function eventosSedes(_req, res) {
  res.json({ sedes: await listarSedes() })
}
export async function eventosCrear(req, res) {
  res.status(201).json({ evento: await crearEvento(req.body || {}, req.usuario, req.ip) })
}
export async function eventosActualizar(req, res) {
  res.json({ evento: await actualizarEvento(parsearId(req.params.id), req.body || {}, req.usuario, req.ip) })
}
export async function eventosEliminar(req, res) {
  await eliminarEvento(parsearId(req.params.id), req.usuario, req.ip)
  res.status(204).end()
}

// ── Avisos (popups) ───────────────────────────────────────────────────────
export async function avisosListar(_req, res) {
  res.json(await listarAvisos())
}
export async function avisosObtener(req, res) {
  res.json({ aviso: await obtenerAviso(parsearId(req.params.id)) })
}
export async function avisosCrear(req, res) {
  res.status(201).json({ aviso: await crearAviso(req.body || {}, req.usuario, req.ip) })
}
export async function avisosActualizar(req, res) {
  res.json({ aviso: await actualizarAviso(parsearId(req.params.id), req.body || {}, req.usuario, req.ip) })
}
export async function avisosEliminar(req, res) {
  await eliminarAviso(parsearId(req.params.id), req.usuario, req.ip)
  res.status(204).end()
}
