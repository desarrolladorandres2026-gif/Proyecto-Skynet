import * as service from './plantillas.service.js'

export async function crear(req, res) {
  const plantilla = await service.crearPlantilla(req.body, req.usuario)
  res.status(201).json({ plantilla })
}

export async function listar(req, res) {
  const plantillas = await service.listarPlantillas(req.query)
  res.json({ plantillas })
}

export async function actualizar(req, res) {
  const plantilla = await service.actualizarPlantilla(req.params.plantillaId, req.body, req.usuario)
  res.json({ plantilla })
}

export async function desactivar(req, res) {
  const plantilla = await service.desactivarPlantilla(req.params.plantillaId, req.usuario)
  res.json({ plantilla })
}

export async function aplicar(req, res) {
  const orden = await service.aplicarPlantilla(req.params.id, req.body.plantillaId, req.usuario)
  res.json({ orden })
}

export async function marcarItem(req, res) {
  const orden = await service.marcarItemChecklist(req.params.id, req.params.itemId, req.body, req.usuario)
  res.json({ orden })
}
