import * as service from './roles.service.js'
import { validarCrearRolDTO, validarActualizarRolDTO } from './roles.dto.js'

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
  res.json({ rol })
}

export async function eliminarRol(req, res) {
  await service.eliminarRol(req.params.id, req.usuario)
  res.json({ mensaje: 'Rol eliminado correctamente' })
}
