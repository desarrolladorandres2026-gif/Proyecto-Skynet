import * as service from './ordenes.service.js'

export async function reportar(req, res) {
  const orden = await service.reportarProblema(req.body, req.usuario)
  res.status(201).json({ orden })
}

export async function programar(req, res) {
  const orden = await service.programarPreventivo(req.body, req.usuario)
  res.status(201).json({ orden })
}

export async function listar(req, res) {
  const data = await service.listarOrdenes(req.usuario, {
    estado: req.query.estado,
    page: Number(req.query.page) || 1,
  })
  res.json(data)
}

export async function tecnicos(_req, res) {
  const usuarios = await service.listarTecnicos()
  res.json({ tecnicos: usuarios })
}

export async function detalle(req, res) {
  const orden = await service.obtenerOrdenDetalle(req.params.id, req.usuario)
  res.json({ orden })
}

export async function asignar(req, res) {
  const { ot, advertencias } = await service.asignarTecnico(req.params.id, req.body, req.usuario)
  res.json({ orden: ot, advertencias })
}

export async function aceptar(req, res) {
  const orden = await service.aceptarOrden(req.params.id, req.usuario)
  res.json({ orden })
}

export async function rechazar(req, res) {
  const orden = await service.rechazarAsignacion(req.params.id, req.body, req.usuario)
  res.json({ orden })
}

export async function pausar(req, res) {
  const orden = await service.pausarOrden(req.params.id, req.body, req.usuario)
  res.json({ orden })
}

export async function reanudar(req, res) {
  const orden = await service.reanudarOrden(req.params.id, req.usuario)
  res.json({ orden })
}

export async function resolver(req, res) {
  const orden = await service.resolverOrden(req.params.id, req.body, req.usuario)
  res.json({ orden })
}

export async function aprobar(req, res) {
  const orden = await service.aprobarCierre(req.params.id, req.body, req.usuario)
  res.json({ orden })
}

export async function rechazarCierre(req, res) {
  const orden = await service.rechazarCierre(req.params.id, req.body, req.usuario)
  res.json({ orden })
}

export async function reabrir(req, res) {
  const orden = await service.reabrirOrden(req.params.id, req.body, req.usuario)
  res.json({ orden })
}

export async function cancelar(req, res) {
  const orden = await service.cancelarOrden(req.params.id, req.body, req.usuario)
  res.json({ orden })
}

export async function escalar(req, res) {
  const orden = await service.escalarOrden(req.params.id, req.body, req.usuario)
  res.json({ orden })
}
