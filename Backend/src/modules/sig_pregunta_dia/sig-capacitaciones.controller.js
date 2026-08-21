import * as capacitacionesService from './sig-capacitaciones.service.js'

export async function crear(req, res) {
  const capacitacion = await capacitacionesService.crearCapacitacion(req.body, req.usuario)
  res.status(201).json({ capacitacion })
}

export async function listar(req, res) {
  const capacitaciones = await capacitacionesService.listarCapacitaciones({ estado: req.query.estado })
  res.json({ capacitaciones })
}

export async function detalle(req, res) {
  const capacitacion = await capacitacionesService.obtenerCapacitacion(req.params.id)
  res.json({ capacitacion })
}

export async function actualizar(req, res) {
  const capacitacion = await capacitacionesService.actualizarCapacitacion(req.params.id, req.body, req.usuario)
  res.json({ capacitacion })
}

export async function marcarParticipante(req, res) {
  const capacitacion = await capacitacionesService.marcarParticipante(
    req.params.id,
    req.params.usuarioId,
    req.body.completado,
    req.usuario
  )
  res.json({ capacitacion })
}
