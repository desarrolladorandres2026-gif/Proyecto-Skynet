import * as service from './bitacora.service.js'

export async function agregar(req, res) {
  const entrada = await service.agregarEntrada(req.params.id, req.body, req.file, req.usuario)
  res.status(201).json({ entrada })
}

export async function listar(req, res) {
  const { q, usuarioId, desde, hasta } = req.query
  const entradas = await service.listarDeOrden(req.params.id, { q, usuarioId, desde, hasta }, req.usuario)
  res.json({ entradas })
}
