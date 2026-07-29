import * as service from './supervisor.service.js'

export async function centroControl(_req, res) {
  res.json(await service.obtenerCentroControl())
}

export async function sugerirTecnico(req, res) {
  const candidatos = await service.sugerirTecnico(req.params.id)
  res.json({ candidatos })
}

export async function balanceCarga(_req, res) {
  const tecnicos = await service.obtenerBalanceCarga()
  res.json({ tecnicos })
}

export async function reasignar(req, res) {
  const orden = await service.reasignar(req.params.id, req.body.tecnicoId, req.usuario)
  res.json({ orden })
}

export async function reasignarLote(req, res) {
  const resultados = await service.reasignarEnLote(req.body.otIds, req.body.tecnicoId, req.usuario)
  res.json({ resultados })
}

export async function centroAprobaciones(_req, res) {
  res.json(await service.obtenerCentroAprobaciones())
}

export async function calendario(req, res) {
  const ordenes = await service.obtenerCalendario(req.query)
  res.json({ ordenes })
}

export async function centroSLA(_req, res) {
  res.json(await service.obtenerCentroSLA())
}

export async function centroHallazgos(req, res) {
  res.json(await service.obtenerCentroHallazgos(req.query))
}

export async function fichaActivo(req, res) {
  res.json(await service.obtenerFichaActivo(req.params.equipoId))
}

export async function actualizarActivo(req, res) {
  const equipo = await service.actualizarCriticidadActivo(req.params.equipoId, req.body, req.usuario)
  res.json({ equipo })
}

export async function activosProblematicos(_req, res) {
  const activos = await service.listarActivosProblematicos()
  res.json({ activos })
}

export async function alertas(_req, res) {
  const alertas = await service.obtenerAlertasOperativas()
  res.json({ alertas })
}

export async function dashboardGerencial(req, res) {
  res.json(await service.obtenerDashboardGerencial(req.query))
}
