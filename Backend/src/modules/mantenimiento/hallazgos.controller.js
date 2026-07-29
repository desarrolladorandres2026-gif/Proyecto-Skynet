import * as service from './hallazgos.service.js'

export async function registrar(req, res) {
  const hallazgo = await service.registrarHallazgo(req.params.id, req.body, req.usuario)
  res.status(201).json({ hallazgo })
}

export async function listarDeOrden(req, res) {
  const hallazgos = await service.listarHallazgosDeOrden(req.params.id, req.usuario)
  res.json({ hallazgos })
}

export async function evidencia(req, res) {
  const hallazgo = await service.agregarEvidenciaHallazgo(req.params.hallazgoId, req.body, req.file, req.usuario)
  res.status(201).json({ hallazgo })
}

export async function seguimiento(req, res) {
  const hallazgo = await service.marcarSeguimiento(req.params.hallazgoId, req.usuario)
  res.json({ hallazgo })
}

export async function resolver(req, res) {
  const hallazgo = await service.marcarResuelto(req.params.hallazgoId, req.usuario)
  res.json({ hallazgo })
}

export async function aceptarRiesgo(req, res) {
  const hallazgo = await service.aceptarRiesgo(req.params.hallazgoId, req.body, req.usuario)
  res.json({ hallazgo })
}

export async function convertir(req, res) {
  const { hallazgo, ordenTrabajo } = await service.convertirEnOT(req.params.hallazgoId, req.usuario)
  res.status(201).json({ hallazgo, ordenTrabajo })
}
