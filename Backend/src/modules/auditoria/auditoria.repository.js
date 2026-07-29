import RegistroAuditoria from '../../models/RegistroAuditoria.js'

export async function listarPaginado(filtro, { page, limit }) {
  const skip = (page - 1) * limit
  const [registros, total] = await Promise.all([
    RegistroAuditoria.find(filtro).sort({ creadoEn: -1 }).skip(skip).limit(limit),
    RegistroAuditoria.countDocuments(filtro),
  ])
  return { registros, total }
}
