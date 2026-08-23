import Permiso from '../../models/Permiso.js'
import * as repo from './roles.repository.js'
import { aRolPublico } from './roles.dto.js'
import { ErrorAutorizacion, ErrorConflicto, ErrorNoEncontrado, ErrorValidacion } from '../../utils/errores.js'
import { registrarAuditoria } from '../../utils/auditoria.js'

// El permiso 'roles:gestionar' (que gatea todo este router, ver
// roles.routes.js) alcanza para crear/editar roles NORMALES, pero NO debe
// alcanzar para acuñar un nuevo rol con esSuperAdmin:true — eso equivaldría
// a que alguien sin ser Super Admin pueda fabricarse una puerta trasera
// hacia el nivel más alto de privilegio. Hoy esto no es explotable de punta
// a punta porque asignar un rol a un usuario exige soloAdmin (ver
// usuarios.routes.js), pero es una violación de mínimo privilegio esperando
// a materializarse el día que 'roles:gestionar' se delegue a alguien que no
// sea Super Admin (el propio código lo contempla como caso de uso futuro).
// Ver auditoría de producción 2026-08-22, hallazgo IMPORTANTE #3.
function exigirSuperAdminParaNivelSuperAdmin(usuarioActor) {
  if (!usuarioActor?.esSuperAdmin) {
    throw new ErrorAutorizacion('Solo un Super Admin puede otorgar o modificar el nivel Super Admin de un rol')
  }
}

// Convierte códigos de permiso (p. ej. "vehiculos:gestionar") en los ObjectId
// que Rol.permisos necesita, validando que todos existan en el catálogo.
async function resolverPermisos(codigos) {
  if (!codigos?.length) return []
  const encontrados = await Permiso.find({ codigo: { $in: codigos } }).select('_id codigo')
  if (encontrados.length !== new Set(codigos).size) {
    const validos = new Set(encontrados.map((p) => p.codigo))
    const invalidos = codigos.filter((c) => !validos.has(c))
    throw new ErrorValidacion(`Permisos inexistentes: ${invalidos.join(', ')}`)
  }
  return encontrados.map((p) => p._id)
}

export async function listarRoles() {
  const roles = await repo.listar()
  return roles.map(aRolPublico)
}

export async function obtenerRol(id) {
  const rol = await repo.obtenerPorId(id)
  if (!rol) throw new ErrorNoEncontrado('Rol no encontrado')
  return aRolPublico(rol)
}

export async function crearRol(datos, usuarioActor) {
  if (datos.esSuperAdmin === true) {
    exigirSuperAdminParaNivelSuperAdmin(usuarioActor)
  }

  const existente = await repo.obtenerPorSlug(datos.slug)
  if (existente) throw new ErrorConflicto(`Ya existe un rol con el slug "${datos.slug}"`)

  const permisos = await resolverPermisos(datos.permisos)
  const rol = await repo.crear({ ...datos, permisos, esSistema: false })

  await registrarAuditoria({
    usuario: usuarioActor,
    accion: 'crear',
    modulo: 'roles',
    entidad: 'Rol',
    entidadId: rol._id,
    descripcion: `Rol creado: ${rol.nombre}`,
    cambios: { antes: null, despues: aRolPublico(rol) },
  })

  return obtenerRol(rol._id)
}

export async function actualizarRol(id, datos, usuarioActor) {
  const actual = await repo.obtenerPorId(id)
  if (!actual) throw new ErrorNoEncontrado('Rol no encontrado')

  if (actual.esSistema) {
    if (datos.slug !== undefined && datos.slug !== actual.slug) {
      throw new ErrorConflicto('No se puede cambiar el slug de un rol del sistema')
    }
    if (datos.esSuperAdmin !== undefined && datos.esSuperAdmin !== actual.esSuperAdmin) {
      throw new ErrorConflicto('No se puede cambiar el nivel de un rol del sistema')
    }
  } else if (datos.esSuperAdmin !== undefined && datos.esSuperAdmin !== actual.esSuperAdmin) {
    // Rol NO de sistema: sí se puede tocar esSuperAdmin, pero solo quien ya
    // es Super Admin puede otorgarlo o retirarlo (ver
    // exigirSuperAdminParaNivelSuperAdmin arriba).
    exigirSuperAdminParaNivelSuperAdmin(usuarioActor)
  }

  const antes = aRolPublico(actual)
  const cambios = { ...datos }
  if (datos.permisos !== undefined) {
    cambios.permisos = await resolverPermisos(datos.permisos)
  }

  const actualizado = await repo.actualizar(id, cambios)

  // Cualquier cambio en este rol (permisos, ámbito, nivel) debe aplicar de
  // inmediato a todos los usuarios que lo tengan asignado, no solo al
  // siguiente que inicie sesión — reutiliza tokenVersion (ver auth.js).
  await repo.invalidarSesionesDeRol(id)

  await registrarAuditoria({
    usuario: usuarioActor,
    accion: 'actualizar',
    modulo: 'roles',
    entidad: 'Rol',
    entidadId: id,
    descripcion: `Rol actualizado: ${actualizado.nombre}`,
    cambios: { antes, despues: aRolPublico(actualizado) },
  })

  return aRolPublico(actualizado)
}

export async function eliminarRol(id, usuarioActor) {
  const rol = await repo.obtenerPorId(id)
  if (!rol) throw new ErrorNoEncontrado('Rol no encontrado')
  if (rol.esSistema) throw new ErrorConflicto('No se puede eliminar un rol del sistema')

  const usuariosConRol = await repo.contarUsuariosConRol(id)
  if (usuariosConRol > 0) {
    throw new ErrorConflicto(`No se puede eliminar: ${usuariosConRol} usuario(s) tienen este rol asignado`)
  }

  await repo.eliminar(id)

  await registrarAuditoria({
    usuario: usuarioActor,
    accion: 'eliminar',
    modulo: 'roles',
    entidad: 'Rol',
    entidadId: id,
    descripcion: `Rol eliminado: ${rol.nombre}`,
    cambios: { antes: aRolPublico(rol), despues: null },
  })
}
