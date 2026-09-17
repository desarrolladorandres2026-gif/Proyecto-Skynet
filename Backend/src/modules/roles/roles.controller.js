import * as service from './roles.service.js'
import { validarCrearRolDTO, validarActualizarRolDTO } from './roles.dto.js'
import Usuario from '../../models/Usuario.js'
import { populateRol, reemitirSesion } from '../auth/auth.controller.js'

// Capa delgada: valida con el DTO, delega en el Service, nunca toca Mongoose
// directamente. Los errores tipados (ErrorNoEncontrado, ErrorConflicto, ...)
// los captura asyncHandler/safeRouter y los resuelve errorHandler.js.
export async function listarRoles(_req, res) {
  const roles = await service.listarRoles()
  res.json({ roles })
}

export async function obtenerRol(req, res) {
  const rol = await service.obtenerRol(req.params.id)
  res.json({ rol })
}

export async function crearRol(req, res) {
  const datos = validarCrearRolDTO(req.body)
  const rol = await service.crearRol(datos, req.usuario)
  res.status(201).json({ rol })
}

export async function actualizarRol(req, res) {
  const datos = validarActualizarRolDTO(req.body)
  const rol = await service.actualizarRol(req.params.id, datos, req.usuario)

  // actualizarRol() invalida (vía tokenVersion) la sesión de TODOS los
  // usuarios con este rol, incluido el propio actor si él mismo lo tiene
  // asignado — de otro modo un Super Admin que edita el rol "Super Admin" se
  // desloguearía a sí mismo con cada guardado. Se reemite su cookie con el
  // tokenVersion ya actualizado para que su sesión actual siga viva.
  if (String(req.usuario?.rol?.id) === String(req.params.id)) {
    const usuarioActor = await populateRol(
      Usuario.findById(req.usuario.id_usuario).select('+sesionesActivas')
    )
    if (usuarioActor) await reemitirSesion(usuarioActor, res)
  }

  res.json({ rol })
}

export async function eliminarRol(req, res) {
  await service.eliminarRol(req.params.id, req.usuario)
  res.json({ mensaje: 'Rol eliminado correctamente' })
}
