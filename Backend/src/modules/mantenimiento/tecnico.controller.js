import * as service from './tecnico.service.js'

export async function llegada(req, res) {
  const { ubicacion, lat, lng, comentario } = req.body
  const orden = await service.registrarLlegada(
    req.params.id,
    {
      ubicacion,
      lat: lat !== undefined && lat !== '' ? Number(lat) : undefined,
      lng: lng !== undefined && lng !== '' ? Number(lng) : undefined,
      comentario,
      foto: req.file?.filename,
    },
    req.usuario
  )
  res.json({ orden })
}

export async function inspeccion(req, res) {
  const orden = await service.iniciarInspeccion(req.params.id, req.usuario)
  res.json({ orden })
}

export async function diagnostico(req, res) {
  const orden = await service.registrarDiagnostico(req.params.id, req.body, req.usuario)
  res.json({ orden })
}

export async function material(req, res) {
  const orden = await service.registrarMaterial(req.params.id, req.body, req.usuario)
  res.status(201).json({ orden })
}

export async function herramienta(req, res) {
  const orden = await service.registrarHerramienta(req.params.id, req.body, req.usuario)
  res.status(201).json({ orden })
}

export async function horas(req, res) {
  const orden = await service.registrarHoras(req.params.id, req.body, req.usuario)
  res.status(201).json({ orden })
}

export async function evidencia(req, res) {
  const orden = await service.agregarEvidencia(req.params.id, req.body, req.file, req.usuario)
  res.status(201).json({ orden })
}

export async function solicitarRepuestos(req, res) {
  const orden = await service.solicitarRepuestos(req.params.id, req.body, req.usuario)
  res.status(201).json({ orden })
}

export async function aprobarRepuestos(req, res) {
  const orden = await service.aprobarRepuestos(req.params.id, req.params.solicitudId, req.usuario)
  res.json({ orden })
}

export async function rechazarRepuestos(req, res) {
  const orden = await service.rechazarRepuestos(req.params.id, req.params.solicitudId, req.body, req.usuario)
  res.json({ orden })
}

export async function entregarRepuestos(req, res) {
  const orden = await service.entregarRepuestos(req.params.id, req.params.solicitudId, req.usuario)
  res.json({ orden })
}

export async function instalarRepuestos(req, res) {
  const orden = await service.instalarRepuestos(req.params.id, req.params.solicitudId, req.usuario)
  res.json({ orden })
}

export async function invitarApoyo(req, res) {
  const orden = await service.invitarApoyo(req.params.id, req.body, req.usuario)
  res.status(201).json({ orden })
}

export async function aceptarApoyo(req, res) {
  const orden = await service.aceptarApoyo(req.params.id, req.params.invitacionId, req.usuario)
  res.json({ orden })
}

export async function rechazarApoyo(req, res) {
  const orden = await service.rechazarApoyo(req.params.id, req.params.invitacionId, req.usuario)
  res.json({ orden })
}
