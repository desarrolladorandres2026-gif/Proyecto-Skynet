import { obtenerResumen } from './resumen.service.js'
import { listarMedios, subirMedio } from './medios.service.js'
import { listarEventos, obtenerEvento, listarSedes, crearEvento, actualizarEvento, eliminarEvento } from './eventos.service.js'
import { listarAvisos, obtenerAviso, crearAviso, actualizarAviso, eliminarAviso } from './avisos.service.js'
import { listarFormularios, listarRadicados, obtenerRadicado, cambiarEstadoRadicado, eliminarRadicado, exportarRadicadosCsv, responderRadicado } from './radicados.service.js'
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

// ── Radicados (PQRSF y demás formularios) ─────────────────────────────────
export async function radicadosFormularios(_req, res) {
  res.json(await listarFormularios())
}
export async function radicadosListar(req, res) {
  const formularioId = Number(req.query.formularioId)
  res.json(
    await listarRadicados({
      ...paginacion(req.query, 50),
      formularioId: Number.isInteger(formularioId) && formularioId > 0 ? formularioId : undefined,
      estado: req.query.estado || undefined,
      buscar: textoBusqueda(req.query.buscar),
    }),
  )
}
export async function radicadosObtener(req, res) {
  res.json({ radicado: await obtenerRadicado(parsearId(req.params.id)) })
}
export async function radicadosEstado(req, res) {
  res.json(await cambiarEstadoRadicado(parsearId(req.params.id), req.body?.estado, req.usuario, req.ip, { soloSiSinLeer: req.body?.soloSiSinLeer === true }))
}

export async function radicadosResponder(req, res) {
  const marcarTramitado = req.body?.marcarTramitado === 'true' || req.body?.marcarTramitado === true
  res.status(201).json(await responderRadicado(parsearId(req.params.id), { nota: req.body?.nota, marcarTramitado }, req.file, req.usuario, req.ip))
}
export async function radicadosEliminar(req, res) {
  await eliminarRadicado(parsearId(req.params.id), req.usuario, req.ip)
  res.status(204).end()
}
export async function radicadosExportar(req, res) {
  const formularioId = Number(req.query.formularioId)
  const csv = await exportarRadicadosCsv({
    formularioId: Number.isInteger(formularioId) && formularioId > 0 ? formularioId : undefined,
    estado: req.query.estado || undefined,
  })
  res.set({
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="radicados-${new Date().toISOString().slice(0, 10)}.csv"`,
  })
  res.send(csv)
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
