import * as service from './plataforma.service.js'

// Endpoint PÚBLICO (sin verificarToken): la pantalla de login tiene que poder
// preguntarlo cuando todavía no existe ninguna sesión. Devuelve solo lo que
// aEstadoPublico expone — ni ids internos ni quién lo programó.
export async function obtenerEstadoPublico(_req, res) {
  res.json({ estado: await service.estadoPublico() })
}

export async function obtenerEstadoAdmin(_req, res) {
  res.json({ estado: await service.estadoAdmin() })
}

export async function programar(req, res) {
  res.json({ estado: await service.programar(req.body, req.usuario) })
}

export async function editar(req, res) {
  res.json({ estado: await service.editarProgramado(req.body, req.usuario) })
}

export async function cancelar(req, res) {
  res.json({ estado: await service.cancelarProgramado(req.usuario) })
}

export async function activar(req, res) {
  res.json({ estado: await service.activarAhora(req.body, req.usuario) })
}

export async function finalizar(req, res) {
  res.json({ estado: await service.finalizar(req.usuario) })
}

export async function historial(req, res) {
  const pagina = Math.max(1, Number(req.query.pagina) || 1)
  // Techo duro: sin él, ?porPagina=100000 obliga a Mongo a materializar toda
  // la coleccion de eventos en una sola respuesta.
  const porPagina = Math.min(100, Math.max(1, Number(req.query.porPagina) || 20))
  res.json(await service.historial({ pagina, porPagina }))
}
