import Permiso from '../../models/Permiso.js'
import * as repo from './roles.repository.js'
import { aRolPublico } from './roles.dto.js'
import { ErrorConflicto, ErrorNoEncontrado, ErrorValidacion } from '../../utils/errores.js'
import { registrarAuditoria } from '../../utils/auditoria.js'

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
