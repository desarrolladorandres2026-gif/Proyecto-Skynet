import Mantenimiento from '../../models/mantenimiento/Mantenimiento.js'
import Usuario from '../../models/Usuario.js'
import Rol from '../../models/Rol.js'
import Permiso from '../../models/Permiso.js'
import { ErrorValidacion, ErrorConflicto } from '../../utils/errores.js'
import { registrarAuditoria } from '../../utils/auditoria.js'

// Helpers compartidos entre ordenes.service.js (ciclo de vida de la Orden de
// Trabajo, Fase 1) y tecnico.service.js (ejecución técnica, Fase 3) — evita
// que ambos reimplementen la misma noción de "quién puede tocar esta OT".

// Todo estado que no sea cerrada/cancelada.
export const ESTADOS_ACTIVOS = [
  'reportado', 'programada', 'asignada', 'en_progreso', 'en_espera',
  'resuelta', 'pendiente_aprobacion',
]

export function obtenerOT(id) {
  return Mantenimiento.findById(id)
    .populate('equipo')
    .populate('tecnico_asignado', 'nombre nombre_usuario email')
    .populate('tecnicos_apoyo', 'nombre nombre_usuario')
    .populate('invitacionesApoyo.tecnico', 'nombre nombre_usuario')
}

export function idDe(refOPoblado) {
  return refOPoblado?._id || refOPoblado
}

export function esParticipante(ot, usuarioActor) {
  if (usuarioActor.esSuperAdmin || usuarioActor.permisos?.has('mantenimiento:ver_todas')) return true
  const uid = String(usuarioActor.id_usuario)
  if (String(idDe(ot.tecnico_asignado)) === uid) return true
  return (ot.tecnicos_apoyo || []).some((t) => String(idDe(t)) === uid)
}

export function requiereSerTecnicoAsignado(ot, usuarioActor) {
  if (String(idDe(ot.tecnico_asignado)) !== String(usuarioActor.id_usuario)) {
    throw new ErrorConflicto('Solo el técnico asignado puede ejecutar esta acción')
  }
}

export function requiereSerParticipante(ot, usuarioActor) {
  if (!esParticipante(ot, usuarioActor)) {
    throw new ErrorConflicto('No tienes acceso a esta orden de trabajo')
  }
}

// Resuelve todos los usuarios activos cuyo Rol tenga el permiso indicado (o
// esSuperAdmin) — para notificaciones dirigidas (p. ej. "avisar a todo
// supervisor"), sin depender de un rol fijo por nombre.
//
// El comodín esSuperAdmin solo aplica para roles de notificación/aprobación
// (supervisar, asignar, aprobar). Para 'mantenimiento:ejecutar' (el equipo
// de técnicos que ejecuta OT) se excluye explícitamente: un Super Admin es
// una cuenta de sistema, no un técnico, y no debe aparecer en el "equipo de
// mantenimiento" ni en sus reportes/KPIs.
export async function usuariosConPermiso(codigo, { incluirSuperAdmin = true } = {}) {
  const permiso = await Permiso.findOne({ codigo }).select('_id')
  const condiciones = []
  if (incluirSuperAdmin) condiciones.push({ esSuperAdmin: true })
  if (permiso) condiciones.push({ permisos: permiso._id })
  const filtroRol = condiciones.length ? { $or: condiciones } : { _id: null }
  const roles = await Rol.find(filtroRol).select('_id')
  const usuarios = await Usuario.find({ rol: { $in: roles.map((r) => r._id) }, estado: 'activo', esPrueba: false }).select('_id')
  return usuarios.map((u) => u._id)
}

export async function validarTecnico(tecnicoId) {
  const usuario = await Usuario.findById(tecnicoId).populate({
    path: 'rol',
    populate: { path: 'permisos', select: 'codigo' },
  })
  if (!usuario || usuario.estado !== 'activo') throw new ErrorValidacion('Técnico no encontrado o inactivo')
  const tienePermiso = usuario.rol?.permisos?.some((p) => p.codigo === 'mantenimiento:ejecutar')
  if (!tienePermiso) throw new ErrorValidacion('El usuario seleccionado no tiene permiso para ejecutar órdenes de mantenimiento')
  return usuario._id
}

export function auditar(usuarioActor, accion, ot, descripcion, cambios) {
  return registrarAuditoria({
    usuario: usuarioActor,
    accion,
    modulo: 'mantenimiento',
    entidad: 'OrdenTrabajo',
    entidadId: ot._id,
    descripcion,
    cambios,
  })
}
