import * as service from './mensajes.service.js'

export async function enviar(req, res) {
  const orden = await service.enviarMensaje(req.params.id, req.body, req.usuario)
  res.status(201).json({ orden })
}

export async function listar(req, res) {
  const mensajes = await service.listarMensajes(req.params.id, req.query.canal, req.usuario)
  res.json({ mensajes })
}
