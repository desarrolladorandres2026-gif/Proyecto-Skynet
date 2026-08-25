import mongoose from 'mongoose'
import Usuario from '../../models/Usuario.js'
import Rol from '../../models/Rol.js'
import { escapeRegex, esEmailValido } from '../../utils/regex.js'
import { hashPassword, validarPassword } from '../../utils/password.js'
import { registrarAuditoria } from '../../utils/auditoria.js'
import { reautenticar } from '../../utils/reautenticacion.js'
import { contarReferenciasHistoricas, eliminarUsuarioDefinitivamente } from './usuarios.eliminacion.js'

const CAMPOS_PUBLICOS = '-password'
const POPULATE_ROL = { path: 'rol', select: 'nombre slug ambito esSuperAdmin' }

// `rol` ahora es un ObjectId (ver models/Usuario.js): valida el formato antes
// de tocar Mongo (un id malformado lanzaría un CastError 500 sin este check)
// y que exista de verdad en el catálogo de Rol.
async function validarRol(rolId) {
  if (!rolId || typeof rolId !== 'string' || !mongoose.Types.ObjectId.isValid(rolId)) {
    return { error: 'El rol es obligatorio y debe ser un identificador válido', rolDoc: null }
  }
  const rolDoc = await Rol.findById(rolId).select('esSuperAdmin nombre')
  if (!rolDoc) return { error: 'El rol indicado no existe', rolDoc: null }
  return { error: null, rolDoc }
}

// El listado y la búsqueda de la pantalla de Usuarios son también la fuente
// que otros módulos (selectores de trabajador, etc.) copian como referencia:
// por eso el filtro de prueba se resuelve acá en un solo lugar en vez de en
// cada caller. `?esPrueba=true` es exclusivo de la vista "🧪 Usuarios de
// prueba"; cualquier otro valor (incluida su ausencia) es la vista real.
function filtroEsPrueba(query) {
  return { esPrueba: query.esPrueba === 'true' }
}

export async function buscarUsuarios(req, res) {
  const { q } = req.query
  if (!q || q.trim().length < 2) {
    return res.status(400).json({ error: 'La búsqueda requiere al menos 2 caracteres' })
  }

  const usuarios = await Usuario.find({
    nombre_usuario: { $regex: escapeRegex(q.trim()), $options: 'i' },
    ...filtroEsPrueba(req.query),
  })
    .select(CAMPOS_PUBLICOS)
    .populate(POPULATE_ROL)
    .limit(10)

  res.json({ usuarios })
}

export async function listarUsuarios(req, res) {
  const usuarios = await Usuario.find(filtroEsPrueba(req.query))
    .select(CAMPOS_PUBLICOS)
    .populate(POPULATE_ROL)
    .sort({ _id: 1 })
  const conteos = await Usuario.aggregate([
    { $group: { _id: '$esPrueba', total: { $sum: 1 } } },
  ])
  const totalReales = conteos.find((c) => c._id === false)?.total || 0
  const totalPrueba = conteos.find((c) => c._id === true)?.total || 0
  res.json({ usuarios, conteos: { reales: totalReales, prueba: totalPrueba } })
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

  const { error: errorRol, rolDoc } = await validarRol(rol)
  if (errorRol) return res.status(400).json({ error: errorRol })

  // Solo un Super Admin puede crear un usuario con rol de nivel Super Admin
  if (rolDoc.esSuperAdmin && !req.usuario?.esSuperAdmin) {
    return res.status(403).json({ error: 'Solo un Super Admin puede asignar el rol de Super Admin a un usuario' })
  }

  const existenteNombre = await Usuario.findOne({ nombre_usuario: nombre_usuario.trim() })
  if (existenteNombre) {
    return res.status(409).json({ error: 'El nombre de usuario ya existe' })
  }

  const existenteEmail = await Usuario.findOne({ email: email.trim().toLowerCase() })
  if (existenteEmail) {
    // Si el correo ya pertenece a un usuario de prueba, no se crea una cuenta
    // duplicada para el mismo trabajador: el admin debe usar
    // POST /usuarios/:id/convertir-real en su lugar (ver requerimiento de no
    // duplicar personal al cargar el listado oficial del Terminal).
    if (existenteEmail.esPrueba) {
      return res.status(409).json({
        error: 'El email ya pertenece a un usuario de prueba. Conviértelo en usuario real en vez de crear una cuenta nueva.',
        usuarioPruebaId: existenteEmail._id,
      })
    }
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
    // La eligió el admin que crea la cuenta, no su dueño: se fuerza a
    // cambiarla en el primer login (ver POST /auth/cambiar-password).
    debeCambiarPassword: true,
    // Todo usuario creado por este flujo (o por cualquier import futuro que
    // reutilice crearUsuario) es siempre personal real, sin importar qué
    // venga en el body: esPrueba solo se activa por la migración inicial o
    // se desactiva vía convertirUsuarioReal.
    esPrueba: false,
  })

  const { password: _omit, ...usuarioSinPassword } = usuario.toObject()

  await registrarAuditoria({
    usuario: req.usuario,
    accion: 'crear',
    modulo: 'usuarios',
    entidad: 'Usuario',
    entidadId: usuario._id,
    descripcion: `Usuario creado: ${usuario.nombre_usuario}`,
    cambios: { despues: usuarioSinPassword },
    ip: req.ip,
  })

  res.status(201).json({ usuario: usuarioSinPassword })
}

export async function actualizarUsuario(req, res) {
  const { id } = req.params
  const { nombre_usuario, password, nombre, rol, dependencia, cargo, modulos, email, estado } = req.body

  const usuario = await Usuario.findById(id).populate({ path: 'rol', select: 'esSuperAdmin nombre' })
  if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' })

  // Solo un Super Admin puede modificar datos o rol de un usuario con rol Super Admin
  if (usuario.rol?.esSuperAdmin && !req.usuario?.esSuperAdmin) {
    return res.status(403).json({ error: 'Solo un Super Admin puede modificar a un usuario con rol Super Admin' })
  }

  // password no viaja aquí (select:false en el schema): el snapshot "antes"
  // de auditoría nunca puede filtrar el hash por accidente.
  const antesDeAuditoria = usuario.toObject()

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
  if (rol !== undefined && rol !== usuario.rol?._id?.toString() && rol !== usuario.rol?.toString()) {
    const { error: errorRol, rolDoc } = await validarRol(rol)
    if (errorRol) return res.status(400).json({ error: errorRol })

    // Solo un Super Admin puede otorgar el nivel Super Admin a un usuario
    if (rolDoc.esSuperAdmin && !req.usuario?.esSuperAdmin) {
      return res.status(403).json({ error: 'Solo un Super Admin puede asignar el rol de Super Admin a un usuario' })
    }

    // Si el usuario era Super Admin activo y se le cambia a un rol sin Super Admin
    if (usuario.rol?.esSuperAdmin && !rolDoc.esSuperAdmin && usuario.estado === 'activo') {
      if (!(await quedaOtroSuperAdminActivo(usuario._id))) {
        return res.status(409).json({ error: 'No puedes degradar al último Super Admin activo del sistema' })
      }
    }

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
    if (estado === 'inactivo' && usuario.rol?.esSuperAdmin && usuario.estado === 'activo') {
      if (!(await quedaOtroSuperAdminActivo(usuario._id))) {
        return res.status(409).json({ error: 'No puedes desactivar al último Super Admin activo del sistema' })
      }
    }
    usuario.estado = estado
    invalidarSesiones = true
  }
  if (password !== undefined) {
    const errorPassword = validarPassword(password)
    if (errorPassword) {
      return res.status(400).json({ error: errorPassword })
    }
    usuario.password = await hashPassword(password)
    // La eligió el admin, no su dueño: mismo criterio que crearUsuario.
    usuario.debeCambiarPassword = true
    invalidarSesiones = true
  }

  if (invalidarSesiones) {
    usuario.tokenVersion += 1
    usuario.intentosFallidos = 0
    usuario.bloqueadoHasta = null
    // Por higiene: tokenVersion ya invalida todas las sesiones abiertas
    // (ver middleware/auth.js); esto solo evita dejar entradas muertas.
    usuario.sesionesActivas = []
  }

  await usuario.save()

  const { password: _omit, ...usuarioSinPassword } = usuario.toObject()

  await registrarAuditoria({
    usuario: req.usuario,
    accion: 'actualizar',
    modulo: 'usuarios',
    entidad: 'Usuario',
    entidadId: usuario._id,
    descripcion: `Usuario actualizado: ${usuario.nombre_usuario}`,
    cambios: { antes: antesDeAuditoria, despues: usuarioSinPassword },
    ip: req.ip,
  })

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

// Convierte un usuario de prueba en real (esPrueba:true -> false). No toca
// contraseña, email, rol ni ningún otro dato: es exactamente el "moverlo de
// sección", no una recreación de la cuenta.
export async function convertirUsuarioReal(req, res) {
  const { id } = req.params

  const usuario = await Usuario.findById(id).populate({ path: 'rol', select: 'esSuperAdmin' })
  if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' })
  if (!usuario.esPrueba) {
    return res.status(409).json({ error: 'Este usuario ya es un usuario real' })
  }

  if (usuario.rol?.esSuperAdmin && !req.usuario?.esSuperAdmin) {
    return res.status(403).json({ error: 'Solo un Super Admin puede convertir o modificar a un usuario con rol Super Admin' })
  }

  usuario.esPrueba = false
  await usuario.save()

  await registrarAuditoria({
    usuario: req.usuario,
    accion: 'actualizar',
    modulo: 'usuarios',
    entidad: 'Usuario',
    entidadId: usuario._id,
    descripcion: `Usuario de prueba convertido en real: ${usuario.nombre_usuario}`,
    ip: req.ip,
  })

  const { password: _omit, ...usuarioSinPassword } = usuario.toObject()
  res.json({ usuario: usuarioSinPassword })
}

// Borrado FÍSICO y definitivo — excepcional. La acción normal para "quitarle
// acceso a alguien" es desactivarlo (PUT /:id con estado:'inactivo', ya
// soportado desde antes): el Usuario sigue existiendo, así que todo su
// historial institucional (Requerimientos, Ausencias, OT de mantenimiento,
// auditoría, etc.) conserva una referencia válida. Este endpoint solo debe
// usarse para limpiar cuentas creadas por error o de prueba, sin ningún
// rastro real en el sistema.
//
// Reglas, en orden (ver auditoría de producción 2026-08-22, plan de la
// Fase 2, sección 1 — "Eliminación de usuarios"):
//   1. No autoborrado (ya existía, BUG-009).
//   2. No vaciar el último Super Admin activo (ya existía).
//   3. NUEVO: el usuario debe estar YA desactivado — fuerza un paso
//      deliberado de dos etapas en vez de poder borrar una cuenta activa de
//      un solo clic.
//   4. NUEVO: reautenticación (mismo patrón de "firma" que purgar
//      auditoría/requerimientos) — un borrado físico es irreversible.
//   5. NUEVO: si el usuario tiene CUALQUIER documento institucional
//      asociado (Grupo B), se rechaza con 409 y el detalle de qué lo
//      referencia — nunca se cascadea un borrado destructivo sobre datos de
//      negocio.
//   6. Solo si el total es 0: se borra en cascada su Grupo A (estado
//      personal/de sesión, sin valor institucional) y el propio Usuario,
//      dentro de una transacción — todo o nada.
export async function eliminarUsuario(req, res) {
  const { id } = req.params
  const { password } = req.body

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

  // Solo un Super Admin puede eliminar a otro usuario con rol Super Admin
  if (usuario.rol?.esSuperAdmin && !req.usuario?.esSuperAdmin) {
    return res.status(403).json({ error: 'Solo un Super Admin puede eliminar a un usuario con rol Super Admin' })
  }

  // Sin esto, la ÚLTIMA cuenta con esSuperAdmin se puede borrar igual que
  // cualquier otra: nadie queda con permisos para gestionar roles ni crear
  // nuevos usuarios, y salir de ese estado exige entrar directo a Mongo.
  // (roles.service.js protege el ROL Super Admin de perder su nivel o
  // eliminarse, pero nada impedía vaciar de USUARIOS ese rol por completo.)
  if (usuario.rol?.esSuperAdmin && !(await quedaOtroSuperAdminActivo(usuario._id))) {
    return res.status(409).json({ error: 'No puedes eliminar el último Super Admin activo del sistema' })
  }

  if (usuario.estado !== 'inactivo') {
    return res.status(409).json({
      error: 'Solo se puede eliminar definitivamente a un usuario ya desactivado. Desactívalo primero (editar → estado inactivo).',
    })
  }

  await reautenticar(req.usuario.id_usuario, password)

  const referencias = await contarReferenciasHistoricas(usuario._id)
  if (referencias.total > 0) {
    return res.status(409).json({
      error: `Este usuario tiene ${referencias.total} registro(s) históricos asociados y no puede eliminarse definitivamente — solo desactivarse.`,
      referencias: referencias.detalle,
    })
  }

  await eliminarUsuarioDefinitivamente(usuario._id)

  await registrarAuditoria({
    usuario: req.usuario,
    accion: 'eliminar',
    modulo: 'usuarios',
    entidad: 'Usuario',
    entidadId: usuario._id,
    descripcion: `Usuario eliminado definitivamente (sin historial institucional): ${usuario.nombre_usuario}`,
    ip: req.ip,
  })

  res.json({ mensaje: 'Usuario eliminado correctamente' })
}
