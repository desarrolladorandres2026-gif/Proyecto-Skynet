import * as service from './historial.service.js'

export async function listarEnviosAdmin(req, res) {
  const resultado = await service.listarEnvios(req.query)
  res.json(resultado)
}

export async function obtenerFiltrosEnvios(_req, res) {
  const filtros = await service.obtenerFiltrosDisponibles()
  res.json(filtros)
}
