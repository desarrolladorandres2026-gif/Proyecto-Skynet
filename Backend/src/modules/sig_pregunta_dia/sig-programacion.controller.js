import * as service from './sig-programaciones.service.js'
import * as campanasService from './sig-campanas.service.js'

export async function crearIndividual(req, res) {
  const programacion = await service.crearProgramacionIndividual(req.body, req.usuario)
  res.status(201).json({ programacion })
}

export async function listarIndividual(req, res) {
  const programaciones = await service.listarProgramacionesIndividuales({
    desde: req.query.desde,
    hasta: req.query.hasta,
    estado: req.query.estado,
  })
  res.json({ programaciones })
}

export async function calendario(req, res) {
  const programaciones = await service.listarProgramacionesCalendario({ desde: req.query.desde, hasta: req.query.hasta })
  res.json({ programaciones })
}

export async function cancelarIndividual(req, res) {
  const programacion = await service.cancelarProgramacionIndividual(req.params.id, req.body.motivo, req.usuario)
  res.json({ programacion })
}

export async function previsualizarCampana(req, res) {
  const previsualizacion = await campanasService.previsualizarCampana(req.body)
  res.json({ previsualizacion })
}

export async function crearCampana(req, res) {
  const campana = await campanasService.crearCampana(req.body, req.usuario)
  res.status(201).json({ campana })
}

export async function listarCampanas(_req, res) {
  const campanas = await campanasService.listarCampanas()
  res.json({ campanas })
}

export async function detalleCampana(req, res) {
  const resultado = await campanasService.obtenerCampana(req.params.id)
  res.json(resultado)
}

export async function pausarCampana(req, res) {
  const campana = await campanasService.pausarCampana(req.params.id, req.usuario)
  res.json({ campana })
}

export async function reanudarCampana(req, res) {
  const campana = await campanasService.reanudarCampana(req.params.id, req.usuario)
  res.json({ campana })
}

export async function cancelarCampana(req, res) {
  const campana = await campanasService.cancelarCampana(req.params.id, req.body.motivo, req.usuario)
  res.json({ campana })
}
