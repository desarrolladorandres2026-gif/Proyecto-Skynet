import RegistroAuditoria from '../../models/RegistroAuditoria.js'

export async function listarPaginado(filtro, { page, limit }) {
  const skip = (page - 1) * limit
  const [registros, total] = await Promise.all([
    RegistroAuditoria.find(filtro).sort({ creadoEn: -1 }).skip(skip).limit(limit),
    RegistroAuditoria.countDocuments(filtro),
  ])
  return { registros, total }
}

export async function eliminarAnteriores(fechaLimite) {
  const { deletedCount } = await RegistroAuditoria.deleteMany({ creadoEn: { $lt: fechaLimite } })
  return deletedCount
}

export function obtenerPorId(id) {
  return RegistroAuditoria.findById(id)
}

export function eliminarPorId(id) {
  return RegistroAuditoria.findByIdAndDelete(id)
}

export function obtenerPorIds(ids) {
  return RegistroAuditoria.find({ _id: { $in: ids } })
}

export async function eliminarPorIds(ids) {
  const { deletedCount } = await RegistroAuditoria.deleteMany({ _id: { $in: ids } })
  return deletedCount
}

export function distintosModulos() {
  return RegistroAuditoria.distinct('modulo')
}

export function distintosAcciones() {
  return RegistroAuditoria.distinct('accion')
}
