import { describe, it, expect, beforeEach } from 'vitest'
import express from 'express'
import cookieParser from 'cookie-parser'
import request from 'supertest'
import jwt from 'jsonwebtoken'

import { env } from '../src/config/env.js'
import Usuario from '../src/models/Usuario.js'
import Rol from '../src/models/Rol.js'
// Registra el modelo en Mongoose (efecto secundario del import): verificarToken
// hace populate de rol.permisos y sin esto falla con MissingSchemaError.
import '../src/models/Permiso.js'
import usuariosRoutes from '../src/modules/usuarios/usuarios.routes.js'
import { notFoundHandler, errorHandler } from '../src/middleware/errorHandler.js'
import { hashPassword } from '../src/utils/password.js'

// Monta el router real con los mismos middlewares de transporte que index.js,
// para que estas pruebas ejerciten también verificarToken/soloAdmin y no solo
// el controller: el 401/403 es parte del contrato del módulo.
function crearApp() {
  const app = express()
  app.use(express.json())
  app.use(cookieParser())
  app.use('/api/usuarios', usuariosRoutes)
  app.use(notFoundHandler)
  app.use(errorHandler)
  return app
}

const app = crearApp()
const PASSWORD_OK = 'Clave.Segura.2026'

function token(usuario) {
  return jwt.sign(
    { id_usuario: usuario._id.toString(), tokenVersion: usuario.tokenVersion },
    env.JWT_SECRET,
    { algorithm: 'HS256', expiresIn: '1h' }
  )
}

async function crearRol({ esSuperAdmin = false, ambito = 'global' } = {}) {
  const sufijo = Math.random().toString(36).slice(2)
  return Rol.create({
    nombre: `Rol-${sufijo}`,
    slug: `rol-${sufijo}`,
    esSuperAdmin,
    ambito,
    permisos: [],
  })
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

let rolAdmin
let rolBasico
let admin
let authAdmin

beforeEach(async () => {
  rolAdmin = await crearRol({ esSuperAdmin: true })
  rolBasico = await crearRol()
  admin = await crearUsuario(rolAdmin, { nombre_usuario: 'admin', email: 'admin@example.com' })
  authAdmin = `Bearer ${token(admin)}`
})

describe('Usuarios — control de acceso', () => {
  it('rechaza sin token', async () => {
    const res = await request(app).get('/api/usuarios')
    expect(res.status).toBe(401)
  })

  it('rechaza a un usuario que no es superadmin', async () => {
    const comun = await crearUsuario(rolBasico)
    const res = await request(app).get('/api/usuarios').set('Authorization', `Bearer ${token(comun)}`)
    expect(res.status).toBe(403)
  })

  it('rechaza a un usuario inactivo aunque su token sea válido', async () => {
    const inactivo = await crearUsuario(rolAdmin, { estado: 'inactivo' })
    const res = await request(app).get('/api/usuarios').set('Authorization', `Bearer ${token(inactivo)}`)
    expect(res.status).toBe(401)
  })
})

describe('Usuarios — listar y buscar', () => {
  it('lista usuarios con el rol poblado y sin exponer la contraseña', async () => {
    const res = await request(app).get('/api/usuarios').set('Authorization', authAdmin)

    expect(res.status).toBe(200)
    expect(res.body.usuarios).toHaveLength(1)
    expect(res.body.usuarios[0].rol.slug).toBe(rolAdmin.slug)
    expect(res.body.usuarios[0].password).toBeUndefined()
  })

  it('la búsqueda exige al menos 2 caracteres', async () => {
    const res = await request(app).get('/api/usuarios/buscar?q=a').set('Authorization', authAdmin)
    expect(res.status).toBe(400)
  })

  it('la búsqueda encuentra por coincidencia parcial de nombre_usuario', async () => {
    await crearUsuario(rolBasico, { nombre_usuario: 'maria.gomez', email: 'maria@example.com' })

    const res = await request(app).get('/api/usuarios/buscar?q=gomez').set('Authorization', authAdmin)

    expect(res.status).toBe(200)
    expect(res.body.usuarios.map((u) => u.nombre_usuario)).toEqual(['maria.gomez'])
  })

  it('la búsqueda trata la entrada como texto literal, no como regex', async () => {
    await crearUsuario(rolBasico, { nombre_usuario: 'carlos', email: 'carlos@example.com' })

    const res = await request(app).get('/api/usuarios/buscar?q=.*').set('Authorization', authAdmin)

    expect(res.status).toBe(200)
    expect(res.body.usuarios).toHaveLength(0)
  })
})

describe('Usuarios — crear', () => {
  const nuevo = () => ({
    nombre_usuario: 'nuevo.empleado',
    nombre: 'Nuevo Empleado',
    email: 'Nuevo.Empleado@Example.COM',
    password: PASSWORD_OK,
    rol: rolBasico._id.toString(),
    cargo: 'Auxiliar',
    dependencia: 'Operaciones',
  })

  it('crea un usuario, normaliza el email y hashea la contraseña', async () => {
    const res = await request(app).post('/api/usuarios').set('Authorization', authAdmin).send(nuevo())

    expect(res.status).toBe(201)
    expect(res.body.usuario.password).toBeUndefined()
    expect(res.body.usuario.email).toBe('nuevo.empleado@example.com')

    const enBd = await Usuario.findById(res.body.usuario._id)
    expect(enBd.password).not.toBe(PASSWORD_OK)
    expect(enBd.password.startsWith('$2')).toBe(true)
  })

  it('rechaza campos obligatorios faltantes', async () => {
    const res = await request(app)
      .post('/api/usuarios')
      .set('Authorization', authAdmin)
      .send({ ...nuevo(), email: undefined })
    expect(res.status).toBe(400)
  })

  it('rechaza un email con formato inválido', async () => {
    const res = await request(app)
      .post('/api/usuarios')
      .set('Authorization', authAdmin)
      .send({ ...nuevo(), email: 'no-es-un-email' })
    expect(res.status).toBe(400)
  })

  it('rechaza una contraseña por debajo del mínimo de política (12 caracteres)', async () => {
    const res = await request(app)
      .post('/api/usuarios')
      .set('Authorization', authAdmin)
      .send({ ...nuevo(), password: 'corta1' })

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/12 caracteres/)
  })

  it('rechaza un rol inexistente o con id malformado sin reventar en 500', async () => {
    const malformado = await request(app)
      .post('/api/usuarios')
      .set('Authorization', authAdmin)
      .send({ ...nuevo(), rol: 'no-es-un-objectid' })
    expect(malformado.status).toBe(400)

    const inexistente = await request(app)
      .post('/api/usuarios')
      .set('Authorization', authAdmin)
      .send({ ...nuevo(), rol: '507f1f77bcf86cd799439011' })
    expect(inexistente.status).toBe(400)
  })

  it('rechaza nombre_usuario y email duplicados con 409', async () => {
    await request(app).post('/api/usuarios').set('Authorization', authAdmin).send(nuevo())

    const mismoUsuario = await request(app)
      .post('/api/usuarios')
      .set('Authorization', authAdmin)
      .send({ ...nuevo(), email: 'otro@example.com' })
    expect(mismoUsuario.status).toBe(409)

    const mismoEmail = await request(app)
      .post('/api/usuarios')
      .set('Authorization', authAdmin)
      .send({ ...nuevo(), nombre_usuario: 'otro.usuario' })
    expect(mismoEmail.status).toBe(409)
  })
})

describe('Usuarios — actualizar e invalidación de sesiones', () => {
  it('actualiza datos de perfil sin invalidar las sesiones abiertas', async () => {
    const objetivo = await crearUsuario(rolBasico)

    const res = await request(app)
      .put(`/api/usuarios/${objetivo._id}`)
      .set('Authorization', authAdmin)
      .send({ nombre: 'Nombre Corregido', cargo: 'Coordinador' })

    expect(res.status).toBe(200)
    const enBd = await Usuario.findById(objetivo._id)
    expect(enBd.nombre).toBe('Nombre Corregido')
    expect(enBd.tokenVersion).toBe(objetivo.tokenVersion)
  })

  it('cambiar el rol invalida el token ya emitido de esa persona', async () => {
    const objetivo = await crearUsuario(rolBasico)
    const tokenViejo = `Bearer ${token(objetivo)}`

    await request(app)
      .put(`/api/usuarios/${objetivo._id}`)
      .set('Authorization', authAdmin)
      .send({ rol: rolAdmin._id.toString() })

    const enBd = await Usuario.findById(objetivo._id)
    expect(enBd.tokenVersion).toBe(objetivo.tokenVersion + 1)

    // Con el rol nuevo sería superadmin, pero su token anterior ya no sirve.
    const res = await request(app).get('/api/usuarios').set('Authorization', tokenViejo)
    expect(res.status).toBe(401)
  })

  it('desactivar y cambiar contraseña también invalidan la sesión', async () => {
    const desactivado = await crearUsuario(rolBasico)
    await request(app)
      .put(`/api/usuarios/${desactivado._id}`)
      .set('Authorization', authAdmin)
      .send({ estado: 'inactivo' })
    expect((await Usuario.findById(desactivado._id)).tokenVersion).toBe(desactivado.tokenVersion + 1)

    const cambiado = await crearUsuario(rolBasico)
    await request(app)
      .put(`/api/usuarios/${cambiado._id}`)
      .set('Authorization', authAdmin)
      .send({ password: 'Otra.Clave.Larga.2026' })
    expect((await Usuario.findById(cambiado._id)).tokenVersion).toBe(cambiado.tokenVersion + 1)
  })

  it('rechaza reasignar un email que ya usa otra persona', async () => {
    const otro = await crearUsuario(rolBasico)
    const objetivo = await crearUsuario(rolBasico)

    const res = await request(app)
      .put(`/api/usuarios/${objetivo._id}`)
      .set('Authorization', authAdmin)
      .send({ email: otro.email })

    expect(res.status).toBe(409)
  })

  it('devuelve 404 al actualizar un usuario inexistente', async () => {
    const res = await request(app)
      .put('/api/usuarios/507f1f77bcf86cd799439011')
      .set('Authorization', authAdmin)
      .send({ nombre: 'X' })
    expect(res.status).toBe(404)
  })
})

describe('Usuarios — eliminar', () => {
  it('elimina y luego devuelve 404', async () => {
    const objetivo = await crearUsuario(rolBasico)

    const res = await request(app).delete(`/api/usuarios/${objetivo._id}`).set('Authorization', authAdmin)
    expect(res.status).toBe(200)
    expect(await Usuario.findById(objetivo._id)).toBeNull()

    const repetido = await request(app).delete(`/api/usuarios/${objetivo._id}`).set('Authorization', authAdmin)
    expect(repetido.status).toBe(404)
  })
})
