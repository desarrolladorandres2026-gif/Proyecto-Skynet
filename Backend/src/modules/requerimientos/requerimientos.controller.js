import * as service from './requerimientos.service.js'

export async function crear(req, res) {
  const requerimiento = await service.crearRequerimiento(req.body, req.usuario)
  res.status(201).json({ requerimiento })
}

export async function misRequerimientos(req, res) {
  const requerimientos = await service.listarMios(req.usuario)
  res.json({ requerimientos })
}

export async function bandejaFinanciero(_req, res) {
  const requerimientos = await service.listarBandejaFinanciero()
  res.json({ requerimientos })
}

export async function bandejaBodega(_req, res) {
  const requerimientos = await service.listarBandejaBodega()
  res.json({ requerimientos })
}

export async function listarTodos(req, res) {
  const requerimientos = await service.listarTodos({ estado: req.query.estado, tipo: req.query.tipo })
  res.json({ requerimientos })
}

export async function detalle(req, res) {
  const requerimiento = await service.obtenerDetalle(req.params.id, req.usuario)
  res.json({ requerimiento })
}

export async function editarFinanciero(req, res) {
  const requerimiento = await service.editarComoFinanciero(req.params.id, req.body, req.usuario)
  res.json({ requerimiento })
}

export async function aprobarFinanciero(req, res) {
  const requerimiento = await service.aprobarComoFinanciero(req.params.id, req.body, req.usuario)
  res.json({ requerimiento })
}

export async function rechazarFinanciero(req, res) {
  const requerimiento = await service.rechazarComoFinanciero(req.params.id, req.body, req.usuario)
  res.json({ requerimiento })
}

export async function marcarEstadoBodega(req, res) {
  const requerimiento = await service.marcarEstadoBodega(req.params.id, req.body, req.usuario)
  res.json({ requerimiento })
}

export async function marcarControlRecibido(req, res) {
  const requerimiento = await service.marcarControlRecibidoItem(req.params.id, req.params.itemId, req.body, req.usuario)
  res.json({ requerimiento })
}
