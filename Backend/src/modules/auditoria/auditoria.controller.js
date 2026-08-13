import * as service from './auditoria.service.js'

export async function listarAuditoria(req, res) {
  const resultado = await service.listarAuditoria(req.query)
  res.json(resultado)
}

export async function eliminarRegistro(req, res) {
  await service.eliminarRegistro(req.params.id, req.usuario)
  res.json({ mensaje: 'Registro de auditoría eliminado correctamente' })
}

export async function eliminarRegistrosMasivo(req, res) {
  const { eliminados } = await service.eliminarRegistrosMasivo(req.body.ids, req.usuario)
  res.json({ mensaje: `${eliminados} registro(s) eliminados correctamente`, eliminados })
}

export async function obtenerFiltros(_req, res) {
  const filtros = await service.obtenerFiltrosDisponibles()
  res.json(filtros)
}
