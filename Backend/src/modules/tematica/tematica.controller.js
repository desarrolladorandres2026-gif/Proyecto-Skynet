import * as service from './tematica.service.js'

export async function obtener(_req, res) {
  res.json({ modo: await service.obtenerModo() })
}

export async function cambiar(req, res) {
  res.json({ modo: await service.cambiarModo(req.body, req.usuario) })
}
