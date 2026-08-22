import crypto from 'node:crypto'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import Usuario from '../../models/Usuario.js'
import PasswordResetToken from '../../models/PasswordResetToken.js'
import { env } from '../../config/env.js'
import { enviarEmailReset } from '../../utils/email.js'
import { esEmailValido } from '../../utils/regex.js'
import { DUMMY_HASH, hashPassword, validarPassword } from '../../utils/password.js'
import { setAuthCookie, clearAuthCookie } from '../../utils/cookies.js'
import { hashToken } from '../../utils/tokens.js'
import { keysModulosDesactivados } from '../sistema/sistema.service.js'
import { estadoEfectivo } from '../plataforma/plataforma.service.js'
import { aEstadoPublico } from '../plataforma/plataforma.dto.js'

// Umbral de bloqueo por fuerza bruta a nivel de cuenta: complementa el rate
// limiting por IP (Backend/src/middleware/rateLimit.js), que no detiene un
// ataque distribuido desde muchas IPs contra una misma cuenta.
const INTENTOS_MAX = 5
const BLOQUEO_MS = 15 * 60 * 1000

function firmarToken(usuario) {
  return jwt.sign(
    {
      id_usuario: usuario._id,
      nombre_usuario: usuario.nombre_usuario,
      // Solo el id: verificarToken revalida rol/permisos/modulos contra la
      // BD en cada request (nunca confía en lo que dice el JWT para
      // autorizar), así que aquí basta con la referencia, no el Rol entero.
      rol: usuario.rol._id,
      modulos: usuario.modulos,
      // Viaja en el JWT para poder invalidar esta "generación" de tokens sin
      // esperar a que expiren: verificarToken la compara contra la BD.
      tokenVersion: usuario.tokenVersion,
    },
    env.JWT_SECRET,
    // Algoritmo fijado explícitamente: evita depender del default y deja
    // constancia de que este sistema usa firma simétrica HS256.
    { expiresIn: env.JWT_EXPIRES_IN, algorithm: 'HS256' }
  )
}

// Registra un intento fallido y, al alcanzar el umbral, bloquea la cuenta
// durante BLOQUEO_MS. Nota: el incremento no es atómico (lectura + escritura),
// lo que bajo concurrencia muy alta podría subcontar intentos; es un trade-off
// aceptable aquí porque el rate limiter por IP ya acota a 10 intentos/15min
// antes de que esto entre en juego.
async function registrarIntentoFallido(usuario) {
  const intentos = usuario.intentosFallidos + 1
  const actualizacion =
    intentos >= INTENTOS_MAX
      ? { intentosFallidos: 0, bloqueadoHasta: new Date(Date.now() + BLOQUEO_MS) }
      : { intentosFallidos: intentos }
  await Usuario.updateOne({ _id: usuario._id }, { $set: actualizacion })
}

async function limpiarIntentosFallidos(usuario) {
  if (usuario.intentosFallidos > 0 || usuario.bloqueadoHasta) {
    await Usuario.updateOne({ _id: usuario._id }, { $set: { intentosFallidos: 0, bloqueadoHasta: null } })
  }
}

// Requiere que `usuario.rol` venga populado (rol + rol.permisos) — ver el
// `.populate()` en login()/me() más abajo. `permisos` se aplana a un array de
// códigos ("vehiculos:gestionar") para que el frontend pueda hacer
// `permisos.includes(codigo)` sin conocer la forma interna de Rol/Permiso.
function usuarioPublico(usuario) {
  return {
    id_usuario: usuario._id,
    nombre_usuario: usuario.nombre_usuario,
    nombre: usuario.nombre,
    email: usuario.email,
    rol: {
      id: usuario.rol._id,
      nombre: usuario.rol.nombre,
      slug: usuario.rol.slug,
      ambito: usuario.rol.ambito,
    },
    esSuperAdmin: usuario.rol.esSuperAdmin === true,
    permisos: (usuario.rol.permisos || []).map((p) => p.codigo),
    empresaId: usuario.empresa || null,
    dependencia: usuario.dependencia,
    cargo: usuario.cargo,
    modulos: usuario.modulos,
    estado: usuario.estado,
    debeCambiarPassword: usuario.debeCambiarPassword === true,
  }
}

function populateRol(query) {
  return query.populate({ path: 'rol', populate: { path: 'permisos', select: 'codigo' } })
}

// Adjunta las keys de módulos desactivados por el Super Admin: el frontend
// las usa para ocultar módulos del sidebar y bloquear sus rutas (AuthContext.
// moduloActivo). No es dato de autorización — el backend ya bloquea por su
// cuenta con requiereModuloActivo — solo de experiencia de usuario.
async function conModulosDesactivados(usuario) {
  return { ...usuario, modulosDesactivados: [...(await keysModulosDesactivados())] }
}

// ── Gate de mantenimiento en el login ───────────────────────────────────────
// El middleware global (middleware/mantenimientoPlataforma.js) deja pasar
// /auth/login a propósito, y el corte real se hace AQUÍ, después de validar
// credenciales. La razón es concreta: si el bloqueo fuera antes de
// autenticar, un administrador cuya cookie caducó durante la ventana no
// podría entrar a finalizar el mantenimiento — quedaría encerrado fuera de su
// propia plataforma, con la única salida de tocar Mongo a mano.
//
// Autenticando primero se puede distinguir a quién dejar pasar. Para todos
// los demás la sesión NO se emite: no se llama a setAuthCookie, así que el
// navegador se queda sin token y no hay nada que "aprovechar" después.
//
// Requiere que `usuario.rol` venga populado con sus permisos (lo hace
// populateRol en el propio login).
function puedeEntrarEnMantenimiento(usuario) {
  if (usuario.rol?.esSuperAdmin === true) return true
  return (usuario.rol?.permisos || []).some((p) => p.codigo === 'plataforma:gestionar')
}

export async function login(req, res) {
  const { email, password } = req.body
  const credencialInvalida = { error: 'Usuario o contraseña incorrectos' }

  // Validación de TIPO antes de tocar la BD: bloquea la inyección NoSQL
  // (p. ej. email o password = {$ne: null}) de forma intencional, no por el
  // efecto colateral de que .trim()/bcrypt lancen una excepción.
  if (typeof email !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'Correo y contraseña son obligatorios' })
  }
  if (!email || !password) {
    return res.status(400).json({ error: 'Correo y contraseña son obligatorios' })
  }

  // Solo se busca en BD si el email tiene formato válido; el email ya es string.
  const usuario = esEmailValido(email.trim())
    ? await populateRol(Usuario.findOne({ email: email.trim().toLowerCase() }).select('+password'))
    : null

  const bloqueado = Boolean(usuario?.bloqueadoHasta && usuario.bloqueadoHasta > new Date())

  // bcrypt.compare se ejecuta SIEMPRE (contra un hash señuelo si no hay usuario)
  // para que el tiempo de respuesta no revele si el email existe (anti-timing).
  // Se ejecuta incluso con la cuenta bloqueada: si no, un atacante podría usar
  // la ausencia del retardo de bcrypt como señal de que la cuenta está bloqueada.
  const hash = usuario?.password ?? DUMMY_HASH
  const passwordOk = await bcrypt.compare(password, hash)

  // Respuesta unificada 401: no se distingue "email no existe" de "contraseña
  // incorrecta", "usuario inactivo" ni "cuenta bloqueada", evitando tanto la
  // enumeración de cuentas como revelar el estado del bloqueo a un atacante.
  if (!usuario || !passwordOk || usuario.estado === 'inactivo' || bloqueado || !usuario.rol) {
    if (usuario && !bloqueado) await registrarIntentoFallido(usuario)
    return res.status(401).json(credencialInvalida)
  }

  await limpiarIntentosFallidos(usuario)

  // Credenciales correctas, pero la plataforma está en mantenimiento: solo
  // pasan quienes pueden administrarlo. Se responde 503 con el mismo cuerpo
  // que el middleware global, para que el frontend pinte la pantalla de
  // mantenimiento con un único camino de código.
  const { doc, enMantenimiento } = await estadoEfectivo()
  if (enMantenimiento && !puedeEntrarEnMantenimiento(usuario)) {
    return res.status(503).json({
      error: 'La plataforma está en mantenimiento',
      mantenimiento: true,
      estado: aEstadoPublico(doc),
    })
  }

  const token = firmarToken(usuario)
  setAuthCookie(res, token)
  res.json({ usuario: await conModulosDesactivados(usuarioPublico(usuario)) })
}

export async function logout(_req, res) {
  clearAuthCookie(res)
  res.json({ mensaje: 'Sesión cerrada correctamente' })
}

export async function me(req, res) {
  const usuario = await populateRol(Usuario.findById(req.usuario.id_usuario))
  if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' })
  res.json({ usuario: await conModulosDesactivados(usuarioPublico(usuario)) })
}

export async function solicitarReset(req, res) {
  const { nombre_usuario, email } = req.body
  const mensajeGenerico = {
    mensaje: 'Si el usuario existe, se ha enviado un correo con instrucciones.',
  }

  if (typeof nombre_usuario !== 'string' || typeof email !== 'string' || !nombre_usuario || !email) {
    return res.status(400).json({ error: 'Usuario y correo son obligatorios' })
  }

  const usuario = await Usuario.findOne({ nombre_usuario: nombre_usuario.trim(), estado: 'activo' })
  // El email del body debe coincidir con el registrado: solo sirve como segundo factor
  // de verificación, nunca como destino de envío (evita reset de cuentas ajenas).
  if (!usuario || !usuario.email || usuario.email.toLowerCase() !== email.trim().toLowerCase()) {
    return res.json(mensajeGenerico)
  }

  await PasswordResetToken.updateMany(
    { usuario: usuario._id, usado: false },
    { $set: { usado: true } }
  )

  // El token en texto plano solo viaja en el correo (enviarEmailReset); en
  // Mongo se guarda su hash (ver utils/tokens.js).
  const token = crypto.randomBytes(32).toString('hex')
  const expira_en = new Date(Date.now() + 60 * 60 * 1000)

  await PasswordResetToken.create({ usuario: usuario._id, token: hashToken(token), expira_en })

  try {
    await enviarEmailReset(usuario.email, usuario.nombre, token)
  } catch (err) {
    console.error('Error enviando email de reset:', err.message)
  }

  res.json(mensajeGenerico)
}

export async function validarToken(req, res) {
  const { token } = req.query
  // El token debe ser string: ?token[$gt]= llega como objeto y permitiría
  // saltarse la comparación exacta (inyección NoSQL vía query string).
  if (typeof token !== 'string' || !token) {
    return res.status(400).json({ error: 'Token requerido' })
  }

  const registro = await PasswordResetToken.findOne({
    token: hashToken(token),
    usado: false,
    expira_en: { $gt: new Date() },
  })

  res.json({ valido: Boolean(registro) })
}

export async function restablecerPassword(req, res) {
  const { token, nueva_password } = req.body

  // token DEBE ser string: {"token":{"$gt":""}} coincidiría con cualquier token
  // activo de la colección y permitiría secuestrar la cuenta asociada sin
  // conocer el token real enviado por email (vulnerabilidad crítica C-1).
  if (typeof token !== 'string' || !token) {
    return res.status(400).json({ error: 'Token y nueva contraseña son obligatorios' })
  }
  const errorPassword = validarPassword(nueva_password)
  if (errorPassword) {
    return res.status(400).json({ error: errorPassword })
  }

  const registro = await PasswordResetToken.findOne({
    token: hashToken(token),
    usado: false,
    expira_en: { $gt: new Date() },
  })
  if (!registro) {
    return res.status(400).json({ error: 'Token inválido o expirado' })
  }

  const passwordHash = await hashPassword(nueva_password)
  // $inc de tokenVersion invalida de inmediato cualquier sesión abierta con la
  // contraseña anterior (en cualquier dispositivo): un reset de contraseña
  // suele responder a una sospecha de cuenta comprometida, así que no debe
  // dejar sesiones viejas vivas hasta que expire su JWT (hasta 8h).
  await Usuario.findByIdAndUpdate(registro.usuario, {
    password: passwordHash,
    $inc: { tokenVersion: 1 },
    intentosFallidos: 0,
    bloqueadoHasta: null,
  })
  registro.usado = true
  await registro.save()

  res.json({ mensaje: 'Contraseña actualizada correctamente' })
}

// Autoservicio dentro de una sesión ya autenticada (a diferencia del flujo de
// reset por email, que no exige conocer la contraseña anterior). Es también
// cómo se cumple el "debeCambiarPassword" forzado tras un primer login con
// contraseña de seed/asignada por un admin.
export async function cambiarPassword(req, res) {
  const { passwordActual, passwordNueva } = req.body

  if (typeof passwordActual !== 'string' || !passwordActual) {
    return res.status(400).json({ error: 'Debes ingresar tu contraseña actual' })
  }
  const errorPassword = validarPassword(passwordNueva)
  if (errorPassword) {
    return res.status(400).json({ error: errorPassword })
  }

  const usuario = await populateRol(Usuario.findById(req.usuario.id_usuario).select('+password'))
  if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' })

  const passwordOk = await bcrypt.compare(passwordActual, usuario.password)
  if (!passwordOk) {
    return res.status(401).json({ error: 'La contraseña actual no es correcta' })
  }

  usuario.password = await hashPassword(passwordNueva)
  usuario.debeCambiarPassword = false
  // Invalida cualquier OTRA sesión abierta con la contraseña anterior (mismo
  // criterio que un reset); la petición actual sigue viva porque abajo se
  // reemite la cookie con el tokenVersion nuevo.
  usuario.tokenVersion += 1
  await usuario.save()

  const token = firmarToken(usuario)
  setAuthCookie(res, token)
  res.json({ usuario: await conModulosDesactivados(usuarioPublico(usuario)) })
}
