import { describe, it, expect, beforeEach } from 'vitest'
import express from 'express'
import cookieParser from 'cookie-parser'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import mongoose from 'mongoose'

import { env } from '../src/config/env.js'
import Usuario from '../src/models/Usuario.js'
import Rol from '../src/models/Rol.js'
import Equipo from '../src/models/mantenimiento/Equipo.js'
import Mantenimiento from '../src/models/mantenimiento/Mantenimiento.js'
import mantenimientoRoutes from '../src/modules/mantenimiento/mantenimiento.routes.js'
import { notFoundHandler, errorHandler } from '../src/middleware/errorHandler.js'
import { hashPassword } from '../src/utils/password.js'

// Fase 4 de la auditoría 2026-08-22: el módulo legado de mantenimiento
// gobierna con un solo flag binario (Usuario.modulos), sin distinguir
// técnico de supervisor. DELETE /equipos/:id y DELETE /mantenimientos/:id
// son las acciones más destructivas de ese módulo (la primera borra en
// cascada TODO el historial de mantenimientos del equipo) y ahora exigen
// además ser Super Admin — el resto de operaciones (crear/editar) sigue
// abierta a cualquiera con el flag, sin cambios.
function crearApp() {
  const app = express()
  app.use(express.json())
  app.use(cookieParser())
  app.use('/api/mantenimiento', mantenimientoRoutes)
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

function refCatalogo(nombre) {
  return { id: new mongoose.Types.ObjectId(), nombre }
}

async function crearEquipo() {
  const sufijo = Math.random().toString(36).slice(2)
  return Equipo.create({
    numero_inventario: `INV-${sufijo}`,
    serial: `SER-${sufijo}`,
    tipo: refCatalogo('Vehículo'),
    marca: refCatalogo('Marca de prueba'),
    modelo: 'Modelo X',
    ubicacion: 'Patio 1',
    responsable: 'Juan',
    dependencia: 'Operaciones',
    estado_actual: 'operativo',
  })
}

async function crearUsuarioConModulo({ esSuperAdmin = false } = {}) {
  const sufijo = Math.random().toString(36).slice(2)
  const rol = await Rol.create({
    nombre: `Rol-${sufijo}`,
    slug: `rol-${sufijo}`,
    esSuperAdmin,
    ambito: 'global',
    permisos: [],
  })
  return Usuario.create({
    nombre_usuario: `user-${sufijo}`,
    nombre: 'Usuario Prueba',
    email: `${sufijo}@example.com`,
    password: await hashPassword(PASSWORD_OK),
    rol: rol._id,
    modulos: ['mantenimiento'],
  })
}

describe('Mantenimiento legado — DELETE restringido a Super Admin', () => {
  it('un usuario con el flag de módulo pero SIN ser superadmin NO puede eliminar un equipo (403)', async () => {
    const equipo = await crearEquipo()
    const usuario = await crearUsuarioConModulo({ esSuperAdmin: false })

    const res = await request(app)
      .delete(`/api/mantenimiento/equipos/${equipo._id}`)
      .set('Authorization', `Bearer ${token(usuario)}`)

    expect(res.status).toBe(403)
    expect(await Equipo.findById(equipo._id)).not.toBeNull()
  })

  it('un Super Admin SÍ puede eliminar un equipo', async () => {
    const equipo = await crearEquipo()
    const admin = await crearUsuarioConModulo({ esSuperAdmin: true })

    const res = await request(app)
      .delete(`/api/mantenimiento/equipos/${equipo._id}`)
      .set('Authorization', `Bearer ${token(admin)}`)

    expect(res.status).toBe(200)
    expect(await Equipo.findById(equipo._id)).toBeNull()
  })

  it('un usuario con el flag de módulo pero SIN ser superadmin NO puede eliminar un mantenimiento (403)', async () => {
    const equipo = await crearEquipo()
    const usuario = await crearUsuarioConModulo({ esSuperAdmin: false })
    const mantenimiento = await Mantenimiento.create({
      equipo: equipo._id,
      fecha: new Date(),
      tipo: 'preventivo',
      descripcion: 'Revisión',
    })

    const res = await request(app)
      .delete(`/api/mantenimiento/mantenimientos/${mantenimiento._id}`)
      .set('Authorization', `Bearer ${token(usuario)}`)

    expect(res.status).toBe(403)
    expect(await Mantenimiento.findById(mantenimiento._id)).not.toBeNull()
  })

  it('un Super Admin SÍ puede eliminar un mantenimiento', async () => {
    const equipo = await crearEquipo()
    const admin = await crearUsuarioConModulo({ esSuperAdmin: true })
    const mantenimiento = await Mantenimiento.create({
      equipo: equipo._id,
      fecha: new Date(),
      tipo: 'preventivo',
      descripcion: 'Revisión',
    })

    const res = await request(app)
      .delete(`/api/mantenimiento/mantenimientos/${mantenimiento._id}`)
      .set('Authorization', `Bearer ${token(admin)}`)

    expect(res.status).toBe(200)
    expect(await Mantenimiento.findById(mantenimiento._id)).toBeNull()
  })

  it('un usuario sin ser superadmin SÍ puede seguir creando y editando equipos (no se rompió la funcionalidad legítima)', async () => {
    const usuario = await crearUsuarioConModulo({ esSuperAdmin: false })

    const resCrear = await request(app)
      .post('/api/mantenimiento/equipos')
      .set('Authorization', `Bearer ${token(usuario)}`)
      .send({
        tipo_id: '',
        otroTipo: 'Vehículo',
        marca_id: '',
        otraMarca: 'Marca X',
        numero_inventario: `INV-${Date.now()}`,
        serial: `SER-${Date.now()}`,
        modelo: 'Modelo Y',
        ubicacion: 'Patio 2',
        responsable: 'Ana',
        dependencia: 'Operaciones',
        estado_actual: 'operativo',
      })

    expect(resCrear.status).toBe(201)
  })
})
