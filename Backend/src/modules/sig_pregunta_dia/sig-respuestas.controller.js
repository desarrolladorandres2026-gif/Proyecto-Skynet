import * as service from './sig-respuestas.service.js'

export async function preguntaDelDia(req, res) {
  const resultado = await service.obtenerPreguntaDelDia(req.usuario)
  res.json(resultado)
}

export async function responder(req, res) {
  const resultado = await service.responder(req.params.id, req.body.opcionIndice, req.usuario)
  res.json(resultado)
}

export async function misHistorial(req, res) {
  const page = Number(req.query.page) || 1
  const limit = Number(req.query.limit) || 20
  const resultado = await service.misHistorial(req.usuario, { page, limit })
  res.json(resultado)
}

export async function miProgreso(req, res) {
  const resultado = await service.miProgreso(req.usuario)
  res.json(resultado)
}
