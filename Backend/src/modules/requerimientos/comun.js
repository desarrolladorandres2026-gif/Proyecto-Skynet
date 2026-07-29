import Requerimiento from '../../models/Requerimiento.js'
import { registrarAuditoria } from '../../utils/auditoria.js'

// Helpers compartidos entre requerimientos.service.js — igual criterio que
// mantenimiento/comun.js: evita reimplementar "quién puede ver esto" y el
// populate estándar en cada función del service.

export const POPULATE_REQUERIMIENTO = [
  { path: 'solicitante', select: 'nombre nombre_usuario email cargo dependencia' },
  { path: 'financiero.aprobadoPor', select: 'nombre nombre_usuario' },
  { path: 'bodega.revisadoPor', select: 'nombre nombre_usuario' },
  { path: 'itemsCompra.controlRecibido.marcadoPor', select: 'nombre nombre_usuario' },
]

export function obtenerRequerimiento(id) {
  return Requerimiento.findById(id).populate(POPULATE_REQUERIMIENTO)
}

// Regla de visibilidad (punto 4 del diseño): dueño del requerimiento, O
// alguien con el permiso de su etapa actual, O supervisión total.
export function puedeVer(doc, usuarioActor) {
  if (usuarioActor.esSuperAdmin) return true
  if (usuarioActor.permisos?.has('requerimientos:ver_todos')) return true
  if (usuarioActor.permisos?.has('requerimientos:aprobar_financiero')) return true
  if (usuarioActor.permisos?.has('requerimientos:gestionar_bodega')) return true
  const solicitanteId = doc.solicitante?._id || doc.solicitante
  return String(solicitanteId) === String(usuarioActor.id_usuario)
}

export function auditar(usuarioActor, accion, doc, descripcion, cambios) {
  return registrarAuditoria({
    usuario: usuarioActor,
    accion,
    modulo: 'requerimientos',
    entidad: 'Requerimiento',
    entidadId: doc._id,
    descripcion,
    cambios,
  })
}
