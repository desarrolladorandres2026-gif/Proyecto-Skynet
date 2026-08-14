import mongoose from 'mongoose'
import Usuario from '../../models/Usuario.js'
import Rol from '../../models/Rol.js'
import { escapeRegex, esEmailValido } from '../../utils/regex.js'
import { hashPassword, validarPassword } from '../../utils/password.js'

const CAMPOS_PUBLICOS = '-password'
const POPULATE_ROL = { path: 'rol', select: 'nombre slug ambito esSuperAdmin' }

// `rol` ahora es un ObjectId (ver models/Usuario.js): valida el formato antes
// de tocar Mongo (un id malformado lanzaría un CastError 500 sin este check)
// y que exista de verdad en el catálogo de Rol.
async function validarRol(rolId) {
  if (!rolId || typeof rolId !== 'string' || !mongoose.Types.ObjectId.isValid(rolId)) {
    return 'El rol es obligatorio y debe ser un identificador válido'
  }
  const existe = await Rol.exists({ _id: rolId })
  if (!existe) return 'El rol indicado no existe'
  return null
}

export async function buscarUsuarios(req, res) {
  const { q } = req.query
  if (!q || q.trim().length < 2) {
    return res.status(400).json({ error: 'La búsqueda requiere al menos 2 caracteres' })
  }

  const usuarios = await Usuario.find({
    nombre_usuario: { $regex: escapeRegex(q.trim()), $options: 'i' },
  })
    .select(CAMPOS_PUBLICOS)
    .populate(POPULATE_ROL)
    .limit(10)

  res.json({ usuarios })
}

export async function listarUsuarios(_req, res) {
  const usuarios = await Usuario.find()
    .select(CAMPOS_PUBLICOS)
    .populate(POPULATE_ROL)
    .sort({ _id: 1 })
  res.json({ usuarios })
}

export async function crearUsuario(req, res) {
  const { nombre_usuario, password, nombre, rol, dependencia, cargo, modulos, email, estado } = req.body

  if (!nombre_usuario || !password || !nombre || !email) {
    return res.status(400).json({ error: 'nombre_usuario, password, nombre y email son obligatorios' })
  }

  if (typeof email !== 'string' || !esEmailValido(email.trim())) {
    return res.status(400).json({ error: 'El email no tiene un formato válido' })
  }

  const errorPassword = validarPassword(password)
  if (errorPassword) {
    return res.status(400).json({ error: errorPassword })
  }

  const errorRol = await validarRol(rol)
  if (errorRol) return res.status(400).json({ error: errorRol })

  const existenteNombre = await Usuario.findOne({ nombre_usuario: nombre_usuario.trim() })
  if (existenteNombre) {
    return res.status(409).json({ error: 'El nombre de usuario ya existe' })
  }

  const existenteEmail = await Usuario.findOne({ email: email.trim().toLowerCase() })
  if (existenteEmail) {
    return res.status(409).json({ error: 'El email ya está registrado' })
  }

  const passwordHash = await hashPassword(password)

  const usuario = await Usuario.create({
    nombre_usuario: nombre_usuario.trim(),
    password: passwordHash,
    nombre,
    email: email.trim().toLowerCase(),
    rol,
    dependencia,
    cargo,
    modulos: modulos || [],
    estado: estado || 'activo',
  })

  const { password: _omit, ...usuarioSinPassword } = usuario.toObject()
  res.status(201).json({ usuario: usuarioSinPassword })
}

export async function actualizarUsuario(req, res) {
  const { id } = req.params
  const { nombre_usuario, password, nombre, rol, dependencia, cargo, modulos, email, estado } = req.body

  const usuario = await Usuario.findById(id)
  if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' })

  // Cualquier cambio que afecte a lo que un token ya emitido "puede hacer"
  // (contraseña, rol, módulos o pasar a inactivo) invalida sus sesiones
  // abiertas: sin esto, un admin podría degradar/desactivar a alguien y esa
  // persona seguiría con acceso completo hasta que su JWT expire (hasta 8h).
  let invalidarSesiones = false

  if (email !== undefined) {
    if (typeof email !== 'string' || !esEmailValido(email.trim())) {
      return res.status(400).json({ error: 'El email no tiene un formato válido' })
    }
    const existenteEmail = await Usuario.findOne({ email: email.trim().toLowerCase(), _id: { $ne: id } })
    if (existenteEmail) {
      return res.status(409).json({ error: 'El email ya está registrado' })
    }
    usuario.email = email.trim().toLowerCase()
  }

  if (nombre_usuario !== undefined) usuario.nombre_usuario = nombre_usuario.trim()
  if (nombre !== undefined) usuario.nombre = nombre
  if (rol !== undefined && rol !== usuario.rol.toString()) {
    const errorRol = await validarRol(rol)
    if (errorRol) return res.status(400).json({ error: errorRol })
    usuario.rol = rol
    invalidarSesiones = true
  }
  if (dependencia !== undefined) usuario.dependencia = dependencia
  if (cargo !== undefined) usuario.cargo = cargo
  if (modulos !== undefined && JSON.stringify(modulos) !== JSON.stringify(usuario.modulos)) {
    usuario.modulos = modulos
    invalidarSesiones = true
  }
  if (estado !== undefined && estado !== usuario.estado) {
    usuario.estado = estado
    invalidarSesiones = true
  }
  if (password !== undefined) {
    const errorPassword = validarPassword(password)
    if (errorPassword) {
      return res.status(400).json({ error: errorPassword })
    }
    usuario.password = await hashPassword(password)
    invalidarSesiones = true
  }

  if (invalidarSesiones) {
    usuario.tokenVersion += 1
    usuario.intentosFallidos = 0
    usuario.bloqueadoHasta = null
  }

  await usuario.save()

  const { password: _omit, ...usuarioSinPassword } = usuario.toObject()
  res.json({ usuario: usuarioSinPassword })
}

// Extraído para poder probarlo directo (ver tests/usuarios.crud.test.js):
// con la ruta protegida por soloAdmin, quien la llama es siempre un Super
// Admin ACTIVO distinto del objetivo (el autoborrado ya se bloquea antes de
// llegar aquí) — así que ese Super Admin que llama SIEMPRE cuenta como "el
// otro que queda", y esta rama nunca se dispara hoy por HTTP. Se mantiene
// como defensa en profundidad (protege también una futura llamada directa al
// service, un borrado en lote, o el caso borde de que el propio actor pase a
// inactivo entre la verificación del token y este punto) y se prueba como
// invariante de datos, no como flujo HTTP alcanzable.
export async function quedaOtroSuperAdminActivo(idExcluido) {
  // countDocuments no puede filtrar por un campo del documento poblado, así
  // que se trae el mínimo necesario y se cuenta en memoria — la tabla de
  // usuarios activos con rol Super Admin es, en la práctica, minúscula.
  const otrosActivos = await Usuario.find({ _id: { $ne: idExcluido }, estado: 'activo' })
    .populate({ path: 'rol', select: 'esSuperAdmin' })
    .select('rol')
    .lean()
  return otrosActivos.some((u) => u.rol?.esSuperAdmin)
}

export async function eliminarUsuario(req, res) {
  const { id } = req.params

  // Sin este check, un admin podía borrar su propia cuenta desde el panel: el
  // token que sigue usando en ese instante queda apuntando a un `_id` que ya
  // no existe en Mongo, y CUALQUIER petición posterior (incluida la siguiente
  // en la misma pestaña) la rechaza verificarToken con 401 sin explicación —
  // la sesión "se cae" sin que la UI diga por qué. Ver BUG-009 en la
  // auditoría 2026-08-13.
  if (id === String(req.usuario.id_usuario)) {
    return res.status(409).json({ error: 'No puedes eliminar tu propia cuenta' })
  }

  const usuario = await Usuario.findById(id).populate({ path: 'rol', select: 'esSuperAdmin' })
  if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' })

  // Sin esto, la ÚLTIMA cuenta con esSuperAdmin se puede borrar igual que
  // cualquier otra: nadie queda con permisos para gestionar roles ni crear
  // nuevos usuarios, y salir de ese estado exige entrar directo a Mongo.
  // (roles.service.js protege el ROL Super Admin de perder su nivel o
  // eliminarse, pero nada impedía vaciar de USUARIOS ese rol por completo.)
  if (usuario.rol?.esSuperAdmin && !(await quedaOtroSuperAdminActivo(usuario._id))) {
    return res.status(409).json({ error: 'No puedes eliminar el último Super Admin activo del sistema' })
  }

  await Usuario.findByIdAndDelete(id)
  res.json({ mensaje: 'Usuario eliminado correctamente' })
}
