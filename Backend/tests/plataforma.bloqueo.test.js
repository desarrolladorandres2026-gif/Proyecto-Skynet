import { describe, it, expect, beforeEach } from 'vitest'
import express from 'express'
import cookieParser from 'cookie-parser'
import request from 'supertest'
import jwt from 'jsonwebtoken'

import { env } from '../src/config/env.js'
import Usuario from '../src/models/Usuario.js'
import Rol from '../src/models/Rol.js'
import Permiso from '../src/models/Permiso.js'
import EstadoPlataforma from '../src/models/EstadoPlataforma.js'
import EnvioNotificacion from '../src/models/EnvioNotificacion.js'
import Notificacion from '../src/models/Notificacion.js'

import authRoutes from '../src/modules/auth/auth.routes.js'
import usuariosRoutes from '../src/modules/usuarios/usuarios.routes.js'
import plataformaRoutes from '../src/modules/plataforma/plataforma.routes.js'
import { bloqueoMantenimiento } from '../src/middleware/mantenimientoPlataforma.js'
import { notFoundHandler, errorHandler } from '../src/middleware/errorHandler.js'
import { invalidarCacheEstado } from '../src/modules/plataforma/plataforma.service.js'
import { hashPassword } from '../src/utils/password.js'

// Monta el backend con el MISMO orden de middlewares que src/index.js. El
// orden es parte de lo que se está probando: si bloqueoMantenimiento se
// montara después de las rutas, no bloquearía nada.
function crearApp() {
  const app = express()
  app.use(express.json())
  app.use(cookieParser())
  app.use(bloqueoMantenimiento)
  app.use('/api/auth', authRoutes)
  app.use('/api/usuarios', usuariosRoutes)
  app.use('/api/plataforma', plataformaRoutes)
  app.get('/health', (_req, res) => res.json({ status: 'ok' }))
  app.use(notFoundHandler)
  app.use(errorHandler)
  return app
}

const app = crearApp()
const PASSWORD = 'Clave.Segura.2026'

async function crearUsuario({ esSuperAdmin = false, permisos = [], email }) {
  const sufijo = Math.random().toString(36).slice(2, 8)
  const docsPermisos = await Promise.all(
    permisos.map((codigo) =>
      Permiso.findOneAndUpdate(
        { codigo },
        { $setOnInsert: { codigo, modulo: codigo.split(':')[0], accion: codigo.split(':')[1], nombre: codigo } },
        { upsert: true, new: true }
      )
    )
  )
  const rol = await Rol.create({
    nombre: `Rol-${sufijo}`,
    slug: `rol-${sufijo}`,
    ambito: 'global',
    esSuperAdmin,
    permisos: docsPermisos.map((p) => p._id),
  })
  return Usuario.create({
    nombre_usuario: `user_${sufijo}`,
    nombre: `Usuario ${sufijo}`,
    email: email || `user_${sufijo}@ttn.test`,
    password: await hashPassword(PASSWORD),
    rol: rol._id,
  })
}

function token(usuario) {
  return jwt.sign(
    { id_usuario: usuario._id.toString(), tokenVersion: usuario.tokenVersion },
    env.JWT_SECRET,
    { algorithm: 'HS256', expiresIn: '1h' }
  )
}

async function ponerEnMantenimiento({ scheduledEnd = null } = {}) {
  await EstadoPlataforma.deleteMany({})
  await EstadoPlataforma.create({
    clave: 'global',
    status: 'en_mantenimiento',
    enabled: true,
    iniciadoEn: new Date(),
    scheduledStart: new Date(),
    scheduledEnd,
    reason: 'Prueba',
    message: 'Volvemos en un rato.',
    notificacionInicioEnviada: true,
  })
  invalidarCacheEstado()
}

beforeEach(() => {
  invalidarCacheEstado()
})

describe('Bloqueo por mantenimiento — plataforma operativa', () => {
  it('deja pasar las rutas protegidas con normalidad', async () => {
    const usuario = await crearUsuario({ esSuperAdmin: true })
    const res = await request(app).get('/api/usuarios').set('Cookie', `skynet_token=${token(usuario)}`)
    expect(res.status).toBe(200)
  })

  it('el estado público responde sin sesión', async () => {
    const res = await request(app).get('/api/plataforma/estado')
    expect(res.status).toBe(200)
    expect(res.body.estado.status).toBe('operativa')
    expect(res.body.estado.enabled).toBe(false)
  })
})

describe('Bloqueo por mantenimiento — plataforma en mantenimiento', () => {
  it('responde 503 con el detalle del mantenimiento en una ruta protegida', async () => {
    const usuario = await crearUsuario({})
    await ponerEnMantenimiento()

    const res = await request(app).get('/api/usuarios').set('Cookie', `skynet_token=${token(usuario)}`)

    expect(res.status).toBe(503)
    expect(res.body.mantenimiento).toBe(true)
    expect(res.body.estado.message).toBe('Volvemos en un rato.')
    expect(res.body.estado.status).toBe('en_mantenimiento')
  })

  it('una sesión válida y antigua NO puede saltarse el mantenimiento', async () => {
    // El escenario que pide el requisito explícitamente: alguien que ya tenía
    // el token en el navegador ANTES de que empezara la ventana. El JWT sigue
    // siendo criptográficamente válido; lo que lo detiene es el gate, no la
    // autenticación.
    const usuario = await crearUsuario({})
    const cookieVieja = `skynet_token=${token(usuario)}`

    expect((await request(app).get('/api/usuarios').set('Cookie', cookieVieja)).status).not.toBe(503)

    await ponerEnMantenimiento()

    const res = await request(app).get('/api/usuarios').set('Cookie', cookieVieja)
    expect(res.status).toBe(503)
  })

  it('incluye Retry-After cuando hay hora de finalización', async () => {
    await ponerEnMantenimiento({ scheduledEnd: new Date(Date.now() + 30 * 60 * 1000) })
    const usuario = await crearUsuario({})

    const res = await request(app).get('/api/usuarios').set('Cookie', `skynet_token=${token(usuario)}`)
    expect(res.status).toBe(503)
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(1500)
  })

  it('mantiene vivos el healthcheck y el estado público', async () => {
    await ponerEnMantenimiento()

    expect((await request(app).get('/health')).status).toBe(200)

    const estado = await request(app).get('/api/plataforma/estado')
    expect(estado.status).toBe(200)
    expect(estado.body.estado.enabled).toBe(true)
  })

  it('permite cerrar sesión durante el mantenimiento', async () => {
    await ponerEnMantenimiento()
    const res = await request(app).post('/api/auth/logout')
    expect(res.status).toBe(200)
  })

  it('un Super Admin sigue trabajando con normalidad', async () => {
    const admin = await crearUsuario({ esSuperAdmin: true })
    await ponerEnMantenimiento()

    const res = await request(app).get('/api/usuarios').set('Cookie', `skynet_token=${token(admin)}`)
    expect(res.status).toBe(200)
  })

  it('quien tiene plataforma:gestionar atraviesa el gate y puede finalizar', async () => {
    const gestor = await crearUsuario({ permisos: ['plataforma:gestionar'] })
    await ponerEnMantenimiento()
    const cookie = `skynet_token=${token(gestor)}`

    // Atravesar el gate NO es lo mismo que tener permiso para todo: este
    // usuario recibe 403 en /api/usuarios porque no tiene usuarios:gestionar.
    // Lo que se comprueba es que ya no recibe 503 — el mantenimiento dejó de
    // ser lo que lo detiene, y el RBAC de siempre vuelve a mandar.
    const res = await request(app).get('/api/usuarios').set('Cookie', cookie)
    expect(res.status).not.toBe(503)
    expect(res.status).toBe(403)

    const fin = await request(app).post('/api/plataforma/finalizar').set('Cookie', cookie)
    expect(fin.status).toBe(200)
    expect(fin.body.estado.status).toBe('operativa')
  })

  it('un usuario normal no puede finalizar el mantenimiento', async () => {
    const usuario = await crearUsuario({})
    await ponerEnMantenimiento()

    const res = await request(app)
      .post('/api/plataforma/finalizar')
      .set('Cookie', `skynet_token=${token(usuario)}`)
    // 403 y no 503: la ruta administrativa está permitida durante la ventana,
    // pero el RBAC de siempre sigue mandando sobre quién puede usarla.
    expect(res.status).toBe(403)
  })

  it('un token inválido no obtiene el trato de administrador', async () => {
    await ponerEnMantenimiento()
    const res = await request(app).get('/api/usuarios').set('Cookie', 'skynet_token=falsificado.no.vale')
    expect(res.status).toBe(503)
  })

  it('un token firmado con otro secreto tampoco pasa', async () => {
    const admin = await crearUsuario({ esSuperAdmin: true })
    await ponerEnMantenimiento()
    const falso = jwt.sign(
      { id_usuario: admin._id.toString(), tokenVersion: admin.tokenVersion },
      'secreto-del-atacante',
      { algorithm: 'HS256', expiresIn: '1h' }
    )

    const res = await request(app).get('/api/usuarios').set('Cookie', `skynet_token=${falso}`)
    expect(res.status).toBe(503)
  })

  it('el token de un Super Admin DESACTIVADO no abre la plataforma', async () => {
    const admin = await crearUsuario({ esSuperAdmin: true })
    const cookie = `skynet_token=${token(admin)}`
    await Usuario.updateOne({ _id: admin._id }, { $set: { estado: 'inactivo' } })
    await ponerEnMantenimiento()

    const res = await request(app).get('/api/usuarios').set('Cookie', cookie)
    expect(res.status).toBe(503)
  })
})

describe('Login durante el mantenimiento', () => {
  it('rechaza el login de un usuario normal con credenciales correctas', async () => {
    const usuario = await crearUsuario({ email: 'normal@ttn.test' })
    await ponerEnMantenimiento()

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'normal@ttn.test', password: PASSWORD })

    expect(res.status).toBe(503)
    expect(res.body.mantenimiento).toBe(true)
    // Lo importante: NO se emitió cookie de sesión. Si se emitiera, quedaría
    // un token válido esperando a que termine la ventana.
    expect(res.headers['set-cookie']).toBeUndefined()
    expect(usuario).toBeTruthy()
  })

  it('deja entrar a un administrador de plataforma para que pueda arreglarlo', async () => {
    await crearUsuario({ permisos: ['plataforma:gestionar'], email: 'gestor@ttn.test' })
    await ponerEnMantenimiento()

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'gestor@ttn.test', password: PASSWORD })

    expect(res.status).toBe(200)
    expect(res.headers['set-cookie'].join()).toContain('skynet_token=')
  })

  it('sigue rechazando credenciales incorrectas con 401, no con 503', async () => {
    await crearUsuario({ email: 'otro@ttn.test' })
    await ponerEnMantenimiento()

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'otro@ttn.test', password: 'clave-que-no-es' })

    // El mantenimiento no debe convertirse en un oráculo que confirme qué
    // credenciales son válidas: una contraseña mala falla igual que siempre.
    expect(res.status).toBe(401)
  })
})

describe('Notificaciones del ciclo de mantenimiento', () => {
  it('encola la notificación de disponibilidad para el personal activo', async () => {
    await crearUsuario({ email: 'trabajador1@ttn.test' })
    await crearUsuario({ email: 'trabajador2@ttn.test' })
    const gestor = await crearUsuario({ permisos: ['plataforma:gestionar'], email: 'jefe@ttn.test' })

    await ponerEnMantenimiento()
    await request(app)
      .post('/api/plataforma/finalizar')
      .set('Cookie', `skynet_token=${token(gestor)}`)
      .expect(200)

    // Cada persona activa recibe su registro interno (la campana) y su fila de
    // envío por email. Esto verifica de paso que la categoría 'plataforma'
    // está dada de alta en notificaciones.catalogo.js: si no lo estuviera,
    // notificar() habría lanzado.
    expect(await Notificacion.countDocuments({ tipo: 'plataforma_disponible' })).toBe(3)
    expect(await EnvioNotificacion.countDocuments({ tipo: 'plataforma_disponible', canal: 'email' })).toBe(3)
  })
})
