import * as service from './auditoria.service.js'

export async function listarAuditoria(req, res) {
  const resultado = await service.listarAuditoria(req.query)
  res.json(resultado)
}
