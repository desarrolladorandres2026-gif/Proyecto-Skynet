import Rol from '../../models/Rol.js'
import Usuario from '../../models/Usuario.js'

// Solo Mongoose: sin reglas de negocio. El Service (roles.service.js) es
// quien decide qué hacer con lo que este repository devuelve.
export function listar() {
  return Rol.find().populate('permisos').sort({ nombre: 1 })
}

export function obtenerPorId(id) {
  return Rol.findById(id).populate('permisos')
}

export function obtenerPorSlug(slug) {
  return Rol.findOne({ slug })
}

export function crear(datos) {
  return Rol.create(datos)
}

export async function actualizar(id, datos) {
  return Rol.findByIdAndUpdate(id, datos, { new: true, runValidators: true }).populate('permisos')
}

export function eliminar(id) {
  return Rol.findByIdAndDelete(id)
}

export function contarUsuariosConRol(id) {
  return Usuario.countDocuments({ rol: id })
}

export function invalidarSesionesDeRol(id) {
  return Usuario.updateMany({ rol: id }, { $inc: { tokenVersion: 1 }, $set: { sesionesActivas: [] } })
}
