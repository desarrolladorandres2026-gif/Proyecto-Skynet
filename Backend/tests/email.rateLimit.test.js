import { describe, it, expect, vi } from 'vitest'
import bcrypt from 'bcryptjs'
import express from 'express'
import cookieParser from 'cookie-parser'
import request from 'supertest'
import jwt from 'jsonwebtoken'

vi.mock('../src/utils/email.js', () => ({
  enviarEmailConexionGmail: vi.fn().mockResolvedValue(undefined),
  enviarEmailGenerico: vi.fn().mockResolvedValue(undefined),
  enviarEmailReset: vi.fn().mockResolvedValue(undefined),
}))

import { env } from '../src/config/env.js'
import emailRoutes from '../src/modules/email/email.routes.js'
import { notFoundHandler, errorHandler } from '../src/middleware/errorHandler.js'
import Usuario from '../src/models/Usuario.js'
import Rol from '../src/models/Rol.js'
import Permiso from '../src/models/Permiso.js'

async function crearPermiso(codigo) {
  const [modulo, accion] = codigo.split(':')
  return Permiso.findOneAndUpdate({ codigo }, { codigo, modulo, accion, nombre: codigo }, { upsert: true, new: true })
}

async function crearUsuarioConPermiso(codigo) {
  const permiso = await crearPermiso(codigo)
  const sufijo = Math.random().toString(36).slice(2)
  const rol = await Rol.create({ nombre: `Rol-${sufijo}`, slug: `rol-${sufijo}`, permisos: [permiso._id] })
  return Usuario.create({
    nombre_usuario: `user-${sufijo}`,
    nombre: 'Persona Prueba',
    password: await bcrypt.hash('clave-segura-123', 4),
    email: `${sufijo}@example.com`,
    rol: rol._id,
  })
}

function crearApp() {
  const app = express()
  app.use(express.json())
  app.use(cookieParser())
  app.use('/api/email', emailRoutes)
  app.use(notFoundHandler)
  app.use(errorHandler)
  return app
}

function autorizacion(usuario) {
  const token = jwt.sign(
    { id_usuario: usuario._id.toString(), tokenVersion: usuario.tokenVersion },
    env.JWT_SECRET,
    { algorithm: 'HS256', expiresIn: '1h' }
  )
  return `Bearer ${token}`
}

// Antes del fix, /email/oauth/gmail/iniciar (que dispara un correo real con
// el remitente transaccional COMPARTIDO del sistema — el mismo que manda los
// resets de password) no tenía ningún límite: una sola cuenta podía llamarlo
// sin freno y agotar la reputación/cupo de ese remitente para todos.
describe('Email — rate limiting en acciones que consumen cuota compartida', () => {
  it('corta con 429 tras superar el límite de solicitudes de conexión de Gmail', async () => {
    const app = crearApp()
    const usuario = await crearUsuarioConPermiso('email:configurar')
    const auth = autorizacion(usuario)

    const respuestas = []
    for (let i = 0; i < 21; i += 1) {
      respuestas.push(await request(app).get('/api/email/oauth/gmail/iniciar').set('Authorization', auth))
    }

    const limitadas = respuestas.filter((r) => r.status === 429)
    const noLimitadas = respuestas.filter((r) => r.status !== 429)

    expect(noLimitadas.length).toBe(20)
    expect(limitadas.length).toBe(1)
  }, 20000)
})
