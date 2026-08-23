import { describe, it, expect, beforeEach, vi } from 'vitest'
import express from 'express'
import cookieParser from 'cookie-parser'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'

import { env } from '../src/config/env.js'
import Usuario from '../src/models/Usuario.js'
import Rol from '../src/models/Rol.js'
import { login, logout, solicitarReset, validarToken, restablecerPassword, cambiarPassword } from '../src/modules/auth/auth.controller.js'
import { verificarToken, soloAdmin } from '../src/middleware/auth.js'
import { requierePermiso } from '../src/middleware/permisos.js'
import authRoutes from '../src/modules/auth/auth.routes.js'
import { notFoundHandler, errorHandler } from '../src/middleware/errorHandler.js'
import { hashPassword } from '../src/utils/password.js'

// Fase 5 de la auditoría 2026-08-22: auth.controller.js concentra la lógica
// de seguridad más sensible del sistema (anti-timing, anti-enumeración,
// lockout, invalidación de tokens de un solo uso) y no tenía ningún test
// dedicado — solo se ejercitaba indirectamente vía otros módulos. Esta
// suite lo cubre directamente.
//
// Las pruebas de LOGIN/RESET que verifican lógica (no el rate limit en sí)
// montan los controladores SIN loginLimiter/resetLimiter, para que ninguna
// pueda gastar por accidente la cuota compartida de otra (express-rate-limit
// vive en el objeto middleware, que es un singleton importado una sola vez
// por archivo de test). El único test de rate limit real monta las rutas
// completas (con el limiter real) en un app aparte, exclusivo para ese caso.
function appSinLimite() {
  const app = express()
  app.use(express.json())
  app.use(cookieParser())
  app.post('/api/auth/login', login)
  app.post('/api/auth/logout', logout)
  app.get('/api/auth/me', verificarToken, (req, res) => res.json({ usuario: req.usuario }))
  app.post('/api/auth/cambiar-password', verificarToken, cambiarPassword)
  app.post('/api/auth/solicitar-reset', solicitarReset)
  app.get('/api/auth/validar-token', validarToken)
  app.post('/api/auth/restablecer-password', restablecerPassword)
  app.get('/api/solo-admin', verificarToken, soloAdmin, (_req, res) => res.json({ ok: true }))
  app.get('/api/con-permiso', verificarToken, requierePermiso('demo:hacer'), (_req, res) => res.json({ ok: true }))
  app.use(notFoundHandler)
  app.use(errorHandler)
  return app
}

function appConLimiteReal() {
  const app = express()
  app.use(express.json())
  app.use(cookieParser())
  app.use('/api/auth', authRoutes)
  app.use(notFoundHandler)
  app.use(errorHandler)
  return app
}

const PASSWORD_OK = 'Clave.Segura.2026'

function firmarToken(usuario, overrides = {}) {
  return jwt.sign(
    { id_usuario: usuario._id.toString(), tokenVersion: usuario.tokenVersion, ...overrides },
    env.JWT_SECRET,
    { algorithm: 'HS256', expiresIn: '1h' }
  )
}

async function crearRolBasico(permisos = []) {
  const sufijo = Math.random().toString(36).slice(2)
  return Rol.create({ nombre: `Rol-${sufijo}`, slug: `rol_${sufijo}`, esSuperAdmin: false, ambito: 'global', permisos })
}

async function crearUsuario(rol, extra = {}) {
  const sufijo = Math.random().toString(36).slice(2)
  return Usuario.create({
    nombre_usuario: `user-${sufijo}`,
    nombre: 'Usuario Prueba',
    email: `${sufijo}@example.com`,
    password: await hashPassword(PASSWORD_OK),
    rol: rol._id,
    ...extra,
  })
}

let app
let rol
let usuario

beforeEach(async () => {
  app = appSinLimite()
  rol = await crearRolBasico()
  usuario = await crearUsuario(rol)
})

describe('LOGIN', () => {
  it('login válido devuelve al usuario y setea la cookie de sesión', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: usuario.email, password: PASSWORD_OK })
    expect(res.status).toBe(200)
    expect(res.body.usuario.email).toBe(usuario.email)
    expect(res.headers['set-cookie']?.[0]).toMatch(/skynet_token=/)
  })

  it('password incorrecta responde 401 genérico', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: usuario.email, password: 'incorrecta-cualquiera' })
    expect(res.status).toBe(401)
    expect(res.body.error).toBe('Usuario o contraseña incorrectos')
  })

  it('usuario inexistente responde exactamente el mismo 401 que password incorrecta (anti-enumeración)', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'no-existe@example.com', password: 'cualquiera12345' })
    expect(res.status).toBe(401)
    expect(res.body.error).toBe('Usuario o contraseña incorrectos')
  })

  it('usuario inactivo con la contraseña correcta también da el mismo 401 genérico', async () => {
    const inactivo = await crearUsuario(rol, { estado: 'inactivo' })
    const res = await request(app).post('/api/auth/login').send({ email: inactivo.email, password: PASSWORD_OK })
    expect(res.status).toBe(401)
    expect(res.body.error).toBe('Usuario o contraseña incorrectos')
  })

  it('bcrypt.compare se ejecuta también cuando el usuario NO existe (defensa anti-timing con DUMMY_HASH)', async () => {
    const spy = vi.spyOn(bcrypt, 'compare')
    await request(app).post('/api/auth/login').send({ email: 'fantasma@example.com', password: 'algo123456789' })
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it('bloquea la cuenta después de 5 intentos fallidos y no dice "bloqueada" explícitamente', async () => {
    for (let i = 0; i < 5; i++) {
      await request(app).post('/api/auth/login').send({ email: usuario.email, password: 'mal' + i })
    }
    const res = await request(app).post('/api/auth/login').send({ email: usuario.email, password: PASSWORD_OK })
    expect(res.status).toBe(401)
    expect(res.body.error).toBe('Usuario o contraseña incorrectos')

    const recargado = await Usuario.findById(usuario._id)
    expect(recargado.bloqueadoHasta).not.toBeNull()
  })

  it('una cuenta cuyo bloqueo ya venció puede volver a iniciar sesión con normalidad', async () => {
    await Usuario.updateOne(
      { _id: usuario._id },
      { $set: { intentosFallidos: 5, bloqueadoHasta: new Date(Date.now() - 1000) } } // ya venció
    )
    const res = await request(app).post('/api/auth/login').send({ email: usuario.email, password: PASSWORD_OK })
    expect(res.status).toBe(200)
  })

  it('un login exitoso limpia los intentos fallidos previos', async () => {
    await request(app).post('/api/auth/login').send({ email: usuario.email, password: 'mal' })
    await request(app).post('/api/auth/login').send({ email: usuario.email, password: PASSWORD_OK })
    const recargado = await Usuario.findById(usuario._id)
    expect(recargado.intentosFallidos).toBe(0)
  })

  it('rechaza payloads no-string (inyección NoSQL vía email/password objeto) con 400, no 500', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: { $ne: null }, password: { $ne: null } })
    expect(res.status).toBe(400)
  })
})

describe('LOGIN — rate limit (app con el limiter real, aislado del resto)', () => {
  it('corta con 429 después de 10 intentos en la ventana', async () => {
    const appLimitado = appConLimiteReal()
    let ultimaRespuesta
    for (let i = 0; i < 11; i++) {
      ultimaRespuesta = await request(appLimitado).post('/api/auth/login').send({ email: 'x@example.com', password: 'y' })
    }
    expect(ultimaRespuesta.status).toBe(429)
  })
})

describe('LOGOUT', () => {
  it('revoca la sesión actual: el mismo token deja de servir después de logout', async () => {
    const login1 = await request(app).post('/api/auth/login').send({ email: usuario.email, password: PASSWORD_OK })
    const cookie = login1.headers['set-cookie']

    const antes = await request(app).get('/api/auth/me').set('Cookie', cookie)
    expect(antes.status).toBe(200)

    await request(app).post('/api/auth/logout').set('Cookie', cookie)

    const despues = await request(app).get('/api/auth/me').set('Cookie', cookie)
    expect(despues.status).toBe(401)
  })

  it('logout de un dispositivo NO cierra la sesión de otro dispositivo del mismo usuario', async () => {
    const loginA = await request(app).post('/api/auth/login').send({ email: usuario.email, password: PASSWORD_OK })
    const loginB = await request(app).post('/api/auth/login').send({ email: usuario.email, password: PASSWORD_OK })

    await request(app).post('/api/auth/logout').set('Cookie', loginA.headers['set-cookie'])

    const meA = await request(app).get('/api/auth/me').set('Cookie', loginA.headers['set-cookie'])
    const meB = await request(app).get('/api/auth/me').set('Cookie', loginB.headers['set-cookie'])
    expect(meA.status).toBe(401)
    expect(meB.status).toBe(200)
  })

  it('funciona sin token (solo borra la cookie, no revienta)', async () => {
    const res = await request(app).post('/api/auth/logout')
    expect(res.status).toBe(200)
  })
})

describe('RESET de contraseña', () => {
  it('solicitar reset con usuario existente responde el mensaje genérico', async () => {
    const res = await request(app)
      .post('/api/auth/solicitar-reset')
      .send({ nombre_usuario: usuario.nombre_usuario, email: usuario.email })
    expect(res.status).toBe(200)
    expect(res.body.mensaje).toMatch(/Si el usuario existe/)
  })

  it('solicitar reset con usuario inexistente responde EXACTAMENTE el mismo mensaje genérico', async () => {
    const res = await request(app)
      .post('/api/auth/solicitar-reset')
      .send({ nombre_usuario: 'no-existe', email: 'no-existe@example.com' })
    expect(res.status).toBe(200)
    expect(res.body.mensaje).toMatch(/Si el usuario existe/)
  })

  it('token inválido (inexistente) no valida y no permite restablecer', async () => {
    const val = await request(app).get('/api/auth/validar-token').query({ token: 'no-existe-este-token' })
    expect(val.body.valido).toBe(false)

    const res = await request(app).post('/api/auth/restablecer-password').send({ token: 'no-existe-este-token', nueva_password: 'Otra.Clave.Segura.9' })
    expect(res.status).toBe(400)
  })

  it('token expirado no valida', async () => {
    const PasswordResetToken = (await import('../src/models/PasswordResetToken.js')).default
    const { hashToken } = await import('../src/utils/tokens.js')
    const tokenPlano = 'token-de-prueba-expirado'
    await PasswordResetToken.create({ usuario: usuario._id, token: hashToken(tokenPlano), expira_en: new Date(Date.now() - 1000), usado: false })

    const val = await request(app).get('/api/auth/validar-token').query({ token: tokenPlano })
    expect(val.body.valido).toBe(false)
  })

  it('token ya usado no vuelve a servir', async () => {
    const PasswordResetToken = (await import('../src/models/PasswordResetToken.js')).default
    const { hashToken } = await import('../src/utils/tokens.js')
    const tokenPlano = 'token-de-prueba-usado'
    await PasswordResetToken.create({ usuario: usuario._id, token: hashToken(tokenPlano), expira_en: new Date(Date.now() + 3600_000), usado: true })

    const val = await request(app).get('/api/auth/validar-token').query({ token: tokenPlano })
    expect(val.body.valido).toBe(false)
  })

  it('un token válido permite restablecer la contraseña, y el propio token queda usado', async () => {
    const PasswordResetToken = (await import('../src/models/PasswordResetToken.js')).default
    const { hashToken } = await import('../src/utils/tokens.js')
    const tokenPlano = 'token-de-prueba-valido'
    await PasswordResetToken.create({ usuario: usuario._id, token: hashToken(tokenPlano), expira_en: new Date(Date.now() + 3600_000), usado: false })

    const val = await request(app).get('/api/auth/validar-token').query({ token: tokenPlano })
    expect(val.body.valido).toBe(true)

    const res = await request(app).post('/api/auth/restablecer-password').send({ token: tokenPlano, nueva_password: 'Otra.Clave.Segura.9' })
    expect(res.status).toBe(200)

    const registro = await PasswordResetToken.findOne({ token: hashToken(tokenPlano) })
    expect(registro.usado).toBe(true)

    // El token ya no vuelve a servir aunque no haya expirado.
    const segundoIntento = await request(app).post('/api/auth/restablecer-password').send({ token: tokenPlano, nueva_password: 'Otra.Clave.Mas.9' })
    expect(segundoIntento.status).toBe(400)
  })

  it('solicitar un segundo reset invalida el token anterior (usado:true) sin que nadie lo haya usado', async () => {
    const PasswordResetToken = (await import('../src/models/PasswordResetToken.js')).default
    await request(app).post('/api/auth/solicitar-reset').send({ nombre_usuario: usuario.nombre_usuario, email: usuario.email })
    const primero = await PasswordResetToken.findOne({ usuario: usuario._id })

    await request(app).post('/api/auth/solicitar-reset').send({ nombre_usuario: usuario.nombre_usuario, email: usuario.email })

    const primeroRecargado = await PasswordResetToken.findById(primero._id)
    expect(primeroRecargado.usado).toBe(true)
  })

  it('restablecer contraseña incrementa tokenVersion (invalida sesiones abiertas)', async () => {
    const PasswordResetToken = (await import('../src/models/PasswordResetToken.js')).default
    const { hashToken } = await import('../src/utils/tokens.js')
    const versionAntes = usuario.tokenVersion
    const tokenPlano = 'token-para-tokenversion'
    await PasswordResetToken.create({ usuario: usuario._id, token: hashToken(tokenPlano), expira_en: new Date(Date.now() + 3600_000), usado: false })

    await request(app).post('/api/auth/restablecer-password').send({ token: tokenPlano, nueva_password: 'Otra.Clave.Segura.9' })

    const recargado = await Usuario.findById(usuario._id)
    expect(recargado.tokenVersion).toBe(versionAntes + 1)
  })

  it('un token que llega como operador Mongo ({"$gt":""}) se rechaza con 400, no secuestra ninguna cuenta', async () => {
    // Vulnerabilidad crítica C-1 ya corregida: si `token` no se validara como
    // string, esto coincidiría con CUALQUIER token activo de la colección.
    const res = await request(app)
      .post('/api/auth/restablecer-password')
      .send({ token: { $gt: '' }, nueva_password: 'Otra.Clave.Segura.9' })
    expect(res.status).toBe(400)

    const valRes = await request(app).get('/api/auth/validar-token').query({ token: { $gt: '' } })
    expect(valRes.status).toBe(400)
  })
})

describe('CAMBIO DE PASSWORD (autoservicio, sesión ya autenticada)', () => {
  it('contraseña actual correcta + nueva válida: cambia y reemite sesión', async () => {
    const token = firmarToken(usuario)
    const res = await request(app)
      .post('/api/auth/cambiar-password')
      .set('Cookie', `skynet_token=${token}`)
      .send({ passwordActual: PASSWORD_OK, passwordNueva: 'Nueva.Clave.Segura.9' })

    expect(res.status).toBe(200)
    expect(res.headers['set-cookie']?.[0]).toMatch(/skynet_token=/)
  })

  it('contraseña actual incorrecta se rechaza y no cambia nada', async () => {
    const token = firmarToken(usuario)
    const res = await request(app)
      .post('/api/auth/cambiar-password')
      .set('Cookie', `skynet_token=${token}`)
      .send({ passwordActual: 'no-es-esta', passwordNueva: 'Nueva.Clave.Segura.9' })

    expect(res.status).toBe(401)
  })

  it('rechaza una contraseña nueva que no cumple la política (mínimo 12 caracteres)', async () => {
    const token = firmarToken(usuario)
    const res = await request(app)
      .post('/api/auth/cambiar-password')
      .set('Cookie', `skynet_token=${token}`)
      .send({ passwordActual: PASSWORD_OK, passwordNueva: 'corta' })

    expect(res.status).toBe(400)
  })

  it('incrementa tokenVersion e invalida sesiones anteriores del mismo usuario', async () => {
    const tokenViejo = firmarToken(usuario)
    // Deja pasar tiempo lógico: registra una sesión con ese jti sería lo
    // ideal, pero como este token se firmó fuera del flujo de login() (no
    // tiene jti), su validez depende solo de tokenVersion — exactamente lo
    // que se está probando aquí.
    await request(app)
      .post('/api/auth/cambiar-password')
      .set('Cookie', `skynet_token=${tokenViejo}`)
      .send({ passwordActual: PASSWORD_OK, passwordNueva: 'Nueva.Clave.Segura.9' })

    const recargado = await Usuario.findById(usuario._id)
    expect(recargado.tokenVersion).toBe(usuario.tokenVersion + 1)

    // El token viejo (tokenVersion anterior) ya no sirve.
    const meConViejo = await request(app).get('/api/auth/me').set('Cookie', `skynet_token=${tokenViejo}`)
    expect(meConViejo.status).toBe(401)
  })
})

describe('MIDDLEWARE — verificarToken / soloAdmin / requierePermiso', () => {
  it('sin token: 401', async () => {
    const res = await request(app).get('/api/auth/me')
    expect(res.status).toBe(401)
  })

  it('token con firma inválida: 401', async () => {
    const res = await request(app).get('/api/auth/me').set('Cookie', 'skynet_token=esto-no-es-un-jwt-valido')
    expect(res.status).toBe(401)
  })

  it('token expirado: 401 con mensaje específico', async () => {
    const tokenExpirado = jwt.sign(
      { id_usuario: usuario._id.toString(), tokenVersion: usuario.tokenVersion },
      env.JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '-1s' }
    )
    const res = await request(app).get('/api/auth/me').set('Cookie', `skynet_token=${tokenExpirado}`)
    expect(res.status).toBe(401)
    expect(res.body.error).toBe('Token expirado')
  })

  it('usuario desactivado después de emitido el token: 401 en la siguiente petición', async () => {
    const token = firmarToken(usuario)
    await Usuario.updateOne({ _id: usuario._id }, { $set: { estado: 'inactivo' } })
    const res = await request(app).get('/api/auth/me').set('Cookie', `skynet_token=${token}`)
    expect(res.status).toBe(401)
  })

  it('tokenVersion desincronizado (token viejo tras un cambio de contraseña/rol): 401', async () => {
    const token = firmarToken(usuario)
    await Usuario.updateOne({ _id: usuario._id }, { $inc: { tokenVersion: 1 } })
    const res = await request(app).get('/api/auth/me').set('Cookie', `skynet_token=${token}`)
    expect(res.status).toBe(401)
  })

  it('soloAdmin rechaza a un usuario que no es Super Admin', async () => {
    const token = firmarToken(usuario)
    const res = await request(app).get('/api/solo-admin').set('Cookie', `skynet_token=${token}`)
    expect(res.status).toBe(403)
  })

  it('soloAdmin deja pasar a un Super Admin', async () => {
    const rolAdmin = await crearRolBasico()
    await Rol.updateOne({ _id: rolAdmin._id }, { $set: { esSuperAdmin: true } })
    const admin = await crearUsuario(rolAdmin)
    const token = firmarToken(admin)
    const res = await request(app).get('/api/solo-admin').set('Cookie', `skynet_token=${token}`)
    expect(res.status).toBe(200)
  })

  it('requierePermiso rechaza a quien no tiene el código exacto', async () => {
    const token = firmarToken(usuario)
    const res = await request(app).get('/api/con-permiso').set('Cookie', `skynet_token=${token}`)
    expect(res.status).toBe(403)
  })

  it('requierePermiso deja pasar a quien sí tiene el permiso', async () => {
    const Permiso = (await import('../src/models/Permiso.js')).default
    const permiso = await Permiso.create({ codigo: 'demo:hacer', modulo: 'demo', accion: 'hacer', nombre: 'Hacer demo' })
    const rolConPermiso = await crearRolBasico([permiso._id])
    const usuarioConPermiso = await crearUsuario(rolConPermiso)
    const token = firmarToken(usuarioConPermiso)
    const res = await request(app).get('/api/con-permiso').set('Cookie', `skynet_token=${token}`)
    expect(res.status).toBe(200)
  })

  it('requierePermiso deja pasar a un Super Admin aunque no tenga el permiso explícito (bypass)', async () => {
    const rolAdmin = await crearRolBasico()
    await Rol.updateOne({ _id: rolAdmin._id }, { $set: { esSuperAdmin: true } })
    const admin = await crearUsuario(rolAdmin)
    const token = firmarToken(admin)
    const res = await request(app).get('/api/con-permiso').set('Cookie', `skynet_token=${token}`)
    expect(res.status).toBe(200)
  })
})
