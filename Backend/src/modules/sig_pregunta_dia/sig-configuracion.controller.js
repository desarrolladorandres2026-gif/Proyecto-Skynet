import * as service from './sig-configuracion.service.js'

export async function obtener(_req, res) {
  const configuracion = await service.obtenerConfiguracion()
  res.json({ configuracion })
}

export async function actualizar(req, res) {
  const configuracion = await service.actualizarConfiguracion(req.body, req.usuario)
  res.json({ configuracion })
}
