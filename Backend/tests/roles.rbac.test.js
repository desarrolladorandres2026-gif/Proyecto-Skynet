import { describe, it, expect, beforeEach } from 'vitest'
import express from 'express'
import cookieParser from 'cookie-parser'
import request from 'supertest'
import jwt from 'jsonwebtoken'

import { env } from '../src/config/env.js'
import Usuario from '../src/models/Usuario.js'
import Rol from '../src/models/Rol.js'
import Permiso from '../src/models/Permiso.js'
import rolesRoutes from '../src/modules/roles/roles.routes.js'
import { notFoundHandler, errorHandler } from '../src/middleware/errorHandler.js'
import { hashPassword } from '../src/utils/password.js'

// Solo el hallazgo IMPORTANTE #3 de la auditoría 2026-08-22: "roles:gestionar"
// no debe alcanzar para acuñar o modificar el nivel esSuperAdmin de un rol.
// Verifica también que un Super Admin real sí puede, y que un rol normal
// (esSuperAdmin:false) sigue siendo administrable con solo "roles:gestionar".
function crearApp() {
  const app = express()
  app.use(express.json())
  app.use(cookieParser())
  app.use('/api/roles', rolesRoutes)
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

async function crearPermiso(codigo) {
  const [modulo, accion] = codigo.split(':')
  return Permiso.create({ codigo, modulo, accion, nombre: codigo })
}

async function crearUsuarioConRol(rol) {
  const sufijo = Math.random().toString(36).slice(2)
  return Usuario.create({
    nombre_usuario: `user-${sufijo}`,
    nombre: 'Usuario Prueba',
    email: `${sufijo}@example.com`,
    password: await hashPassword(PASSWORD_OK),
    rol: rol._id,
  })
}

let rolGestorNoSuperAdmin // tiene el permiso roles:gestionar, pero esSuperAdmin:false
let rolSuperAdmin
let usuarioGestor
let usuarioSuperAdmin
let authGestor
let authSuperAdmin

beforeEach(async () => {
  const permisoRolesGestionar = await crearPermiso('roles:gestionar')

  rolGestorNoSuperAdmin = await Rol.create({
    nombre: `Gestor-${Date.now()}`,
    slug: `gestor-${Date.now()}`,
    esSuperAdmin: false,
    ambito: 'global',
    permisos: [permisoRolesGestionar._id],
  })
  rolSuperAdmin = await Rol.create({
    nombre: `SuperAdmin-${Date.now()}`,
    slug: `super-admin-${Date.now()}`,
    esSuperAdmin: true,
    ambito: 'global',
    permisos: [],
  })

  usuarioGestor = await crearUsuarioConRol(rolGestorNoSuperAdmin)
  usuarioSuperAdmin = await crearUsuarioConRol(rolSuperAdmin)
  authGestor = `Bearer ${token(usuarioGestor)}`
  authSuperAdmin = `Bearer ${token(usuarioSuperAdmin)}`
})

describe('Roles — protección de esSuperAdmin', () => {
  it('roles:gestionar SIN ser superadmin no puede crear un rol con esSuperAdmin:true', async () => {
    const res = await request(app)
      .post('/api/roles')
      .set('Authorization', authGestor)
      .send({ nombre: 'Intento Escalada', slug: `intento_escalada_${Date.now()}`, esSuperAdmin: true })

    expect(res.status).toBe(403)
    const enBD = await Rol.findOne({ slug: { $regex: '^intento_escalada' } })
    expect(enBD).toBeNull()
  })

  it('roles:gestionar SIN ser superadmin SÍ puede crear un rol normal (esSuperAdmin:false)', async () => {
    const res = await request(app)
      .post('/api/roles')
      .set('Authorization', authGestor)
      .send({ nombre: 'Rol Normal', slug: `rol_normal_${Date.now()}` })

    expect(res.status).toBe(201)
    expect(res.body.rol.esSuperAdmin).toBe(false)
  })

  it('un Super Admin SÍ puede crear un rol con esSuperAdmin:true', async () => {
    const res = await request(app)
      .post('/api/roles')
      .set('Authorization', authSuperAdmin)
      .send({ nombre: 'Otro Super Admin', slug: `otro_super_admin_${Date.now()}`, esSuperAdmin: true })

    expect(res.status).toBe(201)
    expect(res.body.rol.esSuperAdmin).toBe(true)
  })

  it('roles:gestionar SIN ser superadmin no puede promover un rol existente a esSuperAdmin:true', async () => {
    const rolNormal = await Rol.create({
      nombre: `Normal-${Date.now()}`,
      slug: `normal-${Date.now()}`,
      esSuperAdmin: false,
      ambito: 'global',
      permisos: [],
    })

    const res = await request(app)
      .put(`/api/roles/${rolNormal._id}`)
      .set('Authorization', authGestor)
      .send({ esSuperAdmin: true })

    expect(res.status).toBe(403)
    const recargado = await Rol.findById(rolNormal._id)
    expect(recargado.esSuperAdmin).toBe(false)
  })

  it('un Super Admin SÍ puede promover un rol existente a esSuperAdmin:true', async () => {
    const rolNormal = await Rol.create({
      nombre: `Normal2-${Date.now()}`,
      slug: `normal2-${Date.now()}`,
      esSuperAdmin: false,
      ambito: 'global',
      permisos: [],
    })

    const res = await request(app)
      .put(`/api/roles/${rolNormal._id}`)
      .set('Authorization', authSuperAdmin)
      .send({ esSuperAdmin: true })

    expect(res.status).toBe(200)
    expect(res.body.rol.esSuperAdmin).toBe(true)
  })

  it('roles:gestionar SIN ser superadmin SÍ puede editar campos normales de un rol (nombre, permisos)', async () => {
    const rolNormal = await Rol.create({
      nombre: `Editable-${Date.now()}`,
      slug: `editable-${Date.now()}`,
      esSuperAdmin: false,
      ambito: 'global',
      permisos: [],
    })

    const res = await request(app)
      .put(`/api/roles/${rolNormal._id}`)
      .set('Authorization', authGestor)
      .send({ nombre: 'Editable Renombrado' })

    expect(res.status).toBe(200)
    expect(res.body.rol.nombre).toBe('Editable Renombrado')
  })

  it('ni siquiera un Super Admin puede cambiar esSuperAdmin de un rol del sistema (esSistema:true)', async () => {
    const rolSistema = await Rol.create({
      nombre: `Sistema-${Date.now()}`,
      slug: `sistema-${Date.now()}`,
      esSuperAdmin: false,
      ambito: 'global',
      permisos: [],
      esSistema: true,
    })

    const res = await request(app)
      .put(`/api/roles/${rolSistema._id}`)
      .set('Authorization', authSuperAdmin)
      .send({ esSuperAdmin: true })

    expect(res.status).toBe(409)
  })
})
