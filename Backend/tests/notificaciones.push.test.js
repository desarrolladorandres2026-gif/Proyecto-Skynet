import { describe, it, expect } from 'vitest'
import bcrypt from 'bcryptjs'
import express from 'express'
import cookieParser from 'cookie-parser'
import request from 'supertest'
import jwt from 'jsonwebtoken'

import { env } from '../src/config/env.js'
import notificacionesRoutes from '../src/modules/notificaciones/notificaciones.routes.js'
import { notFoundHandler, errorHandler } from '../src/middleware/errorHandler.js'
import Usuario from '../src/models/Usuario.js'
import Rol from '../src/models/Rol.js'
// Nunca se usa directamente: verificarToken hace populate('rol.permisos'), y
// mongoose exige que el modelo esté registrado en ESTE archivo de test (cada
// archivo de vitest tiene su propio registro de módulos/esquemas).
import '../src/models/Permiso.js'
import PushSubscription from '../src/models/PushSubscription.js'

async function crearUsuario() {
  const sufijo = Math.random().toString(36).slice(2)
  const rol = await Rol.create({ nombre: `Rol-${sufijo}`, slug: `rol-${sufijo}` })
  return Usuario.create({
    nombre_usuario: `user-${sufijo}`,
    nombre: 'Usuario Prueba',
    password: await bcrypt.hash('clave-segura-123', 4),
    email: `${sufijo}@example.com`,
    rol: rol._id,
  })
}

function crearApp() {
  const app = express()
  app.use(express.json())
  app.use(cookieParser())
  app.use('/api/notificaciones', notificacionesRoutes)
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

// Antes del fix, suscribirPush() guardaba cualquier `endpoint` sin validar
// host ni esquema, y enviarPush() más tarde hacía un POST real a esa URL
// (ver notificaciones.service.js) — un usuario autenticado podía convertir
// al servidor en un proxy SSRF hacia la red interna o metadata de la nube.
describe('Notificaciones push — validación del endpoint (SSRF)', () => {
  const app = crearApp()
  const keys = { p256dh: 'clave-p256dh', auth: 'clave-auth' }

  it('rechaza una IP interna / metadata de nube disfrazada de endpoint', async () => {
    const usuario = await crearUsuario()
    const res = await request(app)
      .post('/api/notificaciones/push/suscribir')
      .set('Authorization', autorizacion(usuario))
      .send({ endpoint: 'http://169.254.169.254/latest/meta-data/iam/security-credentials/', keys })

    expect(res.status).toBe(400)
    expect(await PushSubscription.countDocuments({})).toBe(0)
  })

  it('rechaza un host https arbitrario que no es un servicio de push conocido', async () => {
    const usuario = await crearUsuario()
    const res = await request(app)
      .post('/api/notificaciones/push/suscribir')
      .set('Authorization', autorizacion(usuario))
      .send({ endpoint: 'https://atacante.example.com/callback', keys })

    expect(res.status).toBe(400)
    expect(await PushSubscription.countDocuments({})).toBe(0)
  })

  it('acepta un endpoint real de un servicio de push reconocido (FCM)', async () => {
    const usuario = await crearUsuario()
    const res = await request(app)
      .post('/api/notificaciones/push/suscribir')
      .set('Authorization', autorizacion(usuario))
      .send({ endpoint: 'https://fcm.googleapis.com/fcm/send/abc123', keys })

    expect(res.status).toBe(201)
    expect(await PushSubscription.countDocuments({ usuario: usuario._id })).toBe(1)
  })

  it('acepta un endpoint real de Mozilla (autopush) y de WNS', async () => {
    const usuario = await crearUsuario()

    const mozilla = await request(app)
      .post('/api/notificaciones/push/suscribir')
      .set('Authorization', autorizacion(usuario))
      .send({ endpoint: 'https://updates.push.services.mozilla.com/wpush/v2/abc', keys })
    expect(mozilla.status).toBe(201)

    const wns = await request(app)
      .post('/api/notificaciones/push/suscribir')
      .set('Authorization', autorizacion(usuario))
      .send({ endpoint: 'https://wns2-by3p.notify.windows.com/w/abc', keys })
    expect(wns.status).toBe(201)
  })
})
