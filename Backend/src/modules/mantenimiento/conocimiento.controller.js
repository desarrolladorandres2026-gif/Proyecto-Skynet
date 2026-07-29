import * as service from './conocimiento.service.js'

export async function convertir(req, res) {
  const articulo = await service.convertirDesdeOT(req.params.id, req.body, req.usuario)
  res.status(201).json({ articulo })
}

export async function buscar(req, res) {
  const articulos = await service.buscar(req.query)
  res.json({ articulos })
}

export async function vincular(req, res) {
  const articulo = await service.vincular(req.params.articuloId, req.body.otId, req.usuario)
  res.json({ articulo })
}

export async function curar(req, res) {
  const articulo = await service.curar(req.params.articuloId, req.body, req.usuario)
  res.json({ articulo })
}
