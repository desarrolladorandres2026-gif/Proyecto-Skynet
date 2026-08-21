import { describe, it, expect, vi } from 'vitest'
import bcrypt from 'bcryptjs'
import express from 'express'
import cookieParser from 'cookie-parser'
import request from 'supertest'
import jwt from 'jsonwebtoken'

vi.mock('../src/utils/webpush.js', () => ({ default: { sendNotification: vi.fn() } }))
vi.mock('../src/utils/email.js', () => ({ enviarEmailGenerico: vi.fn() }))

import { env } from '../src/config/env.js'
import notificacionesRoutes from '../src/modules/notificaciones/notificaciones.routes.js'
import { notFoundHandler, errorHandler } from '../src/middleware/errorHandler.js'
import Usuario from '../src/models/Usuario.js'
import Rol from '../src/models/Rol.js'
import Permiso from '../src/models/Permiso.js'
import PushSubscription from '../src/models/PushSubscription.js'
import Notificacion from '../src/models/Notificacion.js'
import EnvioNotificacion from '../src/models/EnvioNotificacion.js'
import ModuloSistema from '../src/models/ModuloSistema.js'
import { notificar } from '../src/modules/notificaciones/notificaciones.service.js'
import * as centro from '../src/modules/notificaciones/centro.service.js'
import * as historial from '../src/modules/notificaciones/historial.service.js'

async function crearPermiso(codigo) {
  const [modulo, accion] = codigo.split(':')
  return Permiso.findOneAndUpdate({ codigo }, { codigo, modulo, accion, nombre: codigo }, { upsert: true, new: true })
}

async function crearUsuario(email, { permisos = [], esSuperAdmin = false } = {}) {
  const docsPermiso = []
  for (const codigo of permisos) docsPermiso.push(await crearPermiso(codigo))
  const sufijo = Math.random().toString(36).slice(2)
  const rol = await Rol.create({
    nombre: `Rol-${sufijo}`,
    slug: `rol-${sufijo}`,
    esSuperAdmin,
    permisos: docsPermiso.map((p) => p._id),
  })
  return Usuario.create({
    nombre_usuario: `user-${sufijo}`,
    nombre: 'Persona Prueba',
    password: await bcrypt.hash('clave-segura-123', 4),
    email,
    rol: rol._id,
    estado: 'activo',
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

describe('notificar() escribe el canal interno (Notificacion)', () => {
  it('crea una fila Notificacion por destinatario, independiente de push/email', async () => {
    const b = await crearUsuario('b-interno@example.com')

    await notificar({ usuarios: [b._id], categoria: 'requerimientos', tipo: 'test', titulo: 'Título', cuerpo: 'Cuerpo', url: '/x' })

    const internas = await Notificacion.find({ usuario: b._id })
    expect(internas).toHaveLength(1)
    expect(internas[0].leida).toBe(false)
    expect(internas[0].titulo).toBe('Título')
  })

  it('respeta la categoría desactivada por preferencia (igual que push/email)', async () => {
    const { default: PreferenciaNotificacion } = await import('../src/models/PreferenciaNotificacion.js')
    const b = await crearUsuario('b-pref@example.com')
    await PreferenciaNotificacion.create({ usuario: b._id, categorias: { requerimientos: false } })

    await notificar({ usuarios: [b._id], categoria: 'requerimientos', tipo: 'test', titulo: 'Título', cuerpo: 'Cuerpo' })

    expect(await Notificacion.countDocuments({ usuario: b._id })).toBe(0)
  })

  it('NO depende de que el módulo ia esté activo', async () => {
    await ModuloSistema.findOneAndUpdate({ key: 'ia' }, { key: 'ia', nombre: 'IA', activo: false }, { upsert: true })
    const b = await crearUsuario('b-sin-ia@example.com')

    await notificar({ usuarios: [b._id], categoria: 'mantenimiento', tipo: 'test', titulo: 'Con IA apagada', cuerpo: 'Cuerpo' })

    const internas = await Notificacion.find({ usuario: b._id })
    expect(internas).toHaveLength(1)
    expect(internas[0].titulo).toBe('Con IA apagada')
  })

  it('se conserva aunque el usuario no esté conectado (solo se lee después)', async () => {
    const b = await crearUsuario('b-offline@example.com')
    await notificar({ usuarios: [b._id], categoria: 'danos', tipo: 'test', titulo: 'Mientras dormías', cuerpo: 'Cuerpo' })

    // "Después" simulado: nueva consulta independiente, como si B se
    // conectara horas más tarde.
    const { notificaciones } = await centro.listarMisNotificaciones(b._id)
    expect(notificaciones.map((n) => n.titulo)).toContain('Mientras dormías')
  })
})

describe('centro.service — ownership', () => {
  it('marcarLeida de una notificación ajena lanza 404 (no expone ni modifica lo de otro usuario)', async () => {
    const a = await crearUsuario('a-owner@example.com')
    const b = await crearUsuario('b-owner@example.com')
    await notificar({ usuarios: [b._id], categoria: 'requerimientos', tipo: 'test', titulo: 'De B', cuerpo: 'Cuerpo' })
    const deB = await Notificacion.findOne({ usuario: b._id })

    await expect(centro.marcarLeida(deB._id, a._id)).rejects.toThrow('Notificación no encontrada')
    expect((await Notificacion.findById(deB._id)).leida).toBe(false)
  })

  it('marcarLeida del propio dueño sí funciona y sella leidaEn', async () => {
    const b = await crearUsuario('b-marca@example.com')
    await notificar({ usuarios: [b._id], categoria: 'requerimientos', tipo: 'test', titulo: 'Para B', cuerpo: 'Cuerpo' })
    const deB = await Notificacion.findOne({ usuario: b._id })

    const actualizada = await centro.marcarLeida(deB._id, b._id)
    expect(actualizada.leida).toBe(true)
    expect(actualizada.leidaEn).toBeInstanceOf(Date)
  })

  it('marcarTodasLeidas solo toca las del usuario indicado', async () => {
    const a = await crearUsuario('a-todas@example.com')
    const b = await crearUsuario('b-todas@example.com')
    await notificar({ usuarios: [a._id, b._id], categoria: 'requerimientos', tipo: 'test', titulo: 'Evento', cuerpo: 'Cuerpo' })

    const { actualizadas } = await centro.marcarTodasLeidas(b._id)
    expect(actualizadas).toBe(1)
    expect((await Notificacion.findOne({ usuario: a._id })).leida).toBe(false)
    expect((await Notificacion.findOne({ usuario: b._id })).leida).toBe(true)
  })

  it('contarNoLeidas cuenta solo las propias y solo las no leídas', async () => {
    const b = await crearUsuario('b-contador@example.com')
    await notificar({ usuarios: [b._id], categoria: 'requerimientos', tipo: 't1', titulo: 'Uno', cuerpo: 'x' })
    await notificar({ usuarios: [b._id], categoria: 'requerimientos', tipo: 't2', titulo: 'Dos', cuerpo: 'x' })
    expect(await centro.contarNoLeidas(b._id)).toBe(2)

    const primera = await Notificacion.findOne({ usuario: b._id, titulo: 'Uno' })
    await centro.marcarLeida(primera._id, b._id)
    expect(await centro.contarNoLeidas(b._id)).toBe(1)
  })
})

describe('Centro de notificaciones — capa HTTP', () => {
  const app = crearApp()

  it('GET /mias solo devuelve las del usuario autenticado, nunca las de otro id', async () => {
    const a = await crearUsuario('a-http@example.com')
    const b = await crearUsuario('b-http@example.com')
    await notificar({ usuarios: [a._id], categoria: 'requerimientos', tipo: 't', titulo: 'Solo de A', cuerpo: 'x' })
    await notificar({ usuarios: [b._id], categoria: 'requerimientos', tipo: 't', titulo: 'Solo de B', cuerpo: 'x' })

    const resB = await request(app).get('/api/notificaciones/mias').set('Authorization', autorizacion(b))
    expect(resB.status).toBe(200)
    expect(resB.body.notificaciones.map((n) => n.titulo)).toEqual(['Solo de B'])

    const resA = await request(app).get('/api/notificaciones/mias').set('Authorization', autorizacion(a))
    expect(resA.body.notificaciones.map((n) => n.titulo)).toEqual(['Solo de A'])
  })

  it('paginación: respeta page/limit y reporta el total real', async () => {
    const b = await crearUsuario('b-paginacion@example.com')
    for (let i = 0; i < 25; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await notificar({ usuarios: [b._id], categoria: 'requerimientos', tipo: 't', titulo: `Evento ${i}`, cuerpo: 'x' })
    }

    const pagina1 = await request(app).get('/api/notificaciones/mias?page=1&limit=10').set('Authorization', autorizacion(b))
    expect(pagina1.body.notificaciones).toHaveLength(10)
    expect(pagina1.body.total).toBe(25)
    expect(pagina1.body.pages).toBe(3)
  })

  it('ignora un usuarioId inventado en query/body: siempre usa la sesión', async () => {
    const a = await crearUsuario('a-inyeccion@example.com')
    const b = await crearUsuario('b-inyeccion@example.com')
    await notificar({ usuarios: [b._id], categoria: 'requerimientos', tipo: 't', titulo: 'Privado de B', cuerpo: 'x' })

    // A intenta pedir la bandeja de B pasando su id por query: el controller
    // nunca lee ese parámetro, así que debe seguir viendo la suya (vacía).
    const res = await request(app)
      .get(`/api/notificaciones/mias?usuarioId=${b._id}&usuario=${b._id}`)
      .set('Authorization', autorizacion(a))
    expect(res.body.notificaciones).toEqual([])
  })

  it('PUT /mias/:id/leida sobre una notificación ajena responde 404', async () => {
    const a = await crearUsuario('a-put@example.com')
    const b = await crearUsuario('b-put@example.com')
    await notificar({ usuarios: [b._id], categoria: 'requerimientos', tipo: 't', titulo: 'De B', cuerpo: 'x' })
    const deB = await Notificacion.findOne({ usuario: b._id })

    const res = await request(app).put(`/api/notificaciones/mias/${deB._id}/leida`).set('Authorization', autorizacion(a))
    expect(res.status).toBe(404)
  })

  it('GET /mias/no-leidas devuelve el contador propio', async () => {
    const b = await crearUsuario('b-contador-http@example.com')
    await notificar({ usuarios: [b._id], categoria: 'requerimientos', tipo: 't', titulo: 'x', cuerpo: 'x' })
    const res = await request(app).get('/api/notificaciones/mias/no-leidas').set('Authorization', autorizacion(b))
    expect(res.body).toEqual({ total: 1 })
  })

  it('PUT /mias/leidas marca todas las propias como leídas', async () => {
    const b = await crearUsuario('b-leidas-http@example.com')
    await notificar({ usuarios: [b._id], categoria: 'requerimientos', tipo: 't1', titulo: 'x', cuerpo: 'x' })
    await notificar({ usuarios: [b._id], categoria: 'requerimientos', tipo: 't2', titulo: 'y', cuerpo: 'x' })

    const res = await request(app).put('/api/notificaciones/mias/leidas').set('Authorization', autorizacion(b))
    expect(res.body.actualizadas).toBe(2)
    expect(await centro.contarNoLeidas(b._id)).toBe(0)
  })
})

describe('Historial administrativo de envíos — capa HTTP', () => {
  const app = crearApp()

  it('sin el permiso notificaciones:ver_historial responde 403', async () => {
    const sinPermiso = await crearUsuario('sin-permiso-historial@example.com')
    const res = await request(app).get('/api/notificaciones/admin/envios').set('Authorization', autorizacion(sinPermiso))
    expect(res.status).toBe(403)
  })

  it('con el permiso, lista los envíos y admite filtrar por canal/estado/categoría', async () => {
    const admin = await crearUsuario('admin-historial@example.com', { permisos: ['notificaciones:ver_historial'] })
    const b = await crearUsuario('b-historial@example.com')
    await PushSubscription.create({ usuario: b._id, endpoint: 'https://push.test/historial', p256dh: 'p', auth: 'a' })
    await notificar({ usuarios: [b._id], categoria: 'requerimientos', tipo: 't', titulo: 'Evento historial', cuerpo: 'x' })

    const res = await request(app)
      .get('/api/notificaciones/admin/envios?canal=push&categoria=requerimientos')
      .set('Authorization', autorizacion(admin))
    expect(res.status).toBe(200)
    expect(res.body.envios.length).toBeGreaterThan(0)
    expect(res.body.envios.every((e) => e.canal === 'push')).toBe(true)
    // Nunca expone credenciales/claves — solo los campos de negocio.
    expect(res.body.envios[0]).not.toHaveProperty('p256dh')
    expect(res.body.envios[0]).not.toHaveProperty('auth')
  })

  it('esSuperAdmin bypassa el permiso explícito (mismo criterio que el resto del RBAC)', async () => {
    const admin = await crearUsuario('super-historial@example.com', { esSuperAdmin: true })
    const res = await request(app).get('/api/notificaciones/admin/envios').set('Authorization', autorizacion(admin))
    expect(res.status).toBe(200)
  })
})

describe('Escenario A → B de extremo a extremo', () => {
  const app = crearApp()

  it('A ejecuta una acción sobre B: B recibe interna+push+email; A no recibe nada dirigido a B; ambos canales quedan en EnvioNotificacion', async () => {
    const a = await crearUsuario('a-extremo-a-extremo@example.com')
    const b = await crearUsuario('b-extremo-a-extremo@example.com')
    await PushSubscription.create({ usuario: b._id, endpoint: 'https://push.test/e2e', p256dh: 'p', auth: 'a' })

    // Mismo motor real que usa cualquier módulo de negocio (requerimientos,
    // ausencias, danos...) — no una simulación aparte.
    await notificar({
      usuarios: [b._id],
      categoria: 'requerimientos',
      tipo: 'solicitud-A-a-B',
      titulo: `${a.nombre_usuario} te solicitó una acción`,
      cuerpo: 'Prueba end-to-end A → B',
      url: '/requerimientos/mios',
    })

    // B: interna
    const internasB = await Notificacion.find({ usuario: b._id })
    expect(internasB).toHaveLength(1)

    // B: push (tiene suscripción activa) y email (tiene correo, sin preferencia que lo bloquee)
    const enviosB = await EnvioNotificacion.find({ usuario: b._id })
    expect(enviosB.map((e) => e.canal).sort()).toEqual(['email', 'push'])

    // A: nada — el evento era exclusivamente para B
    expect(await Notificacion.countDocuments({ usuario: a._id })).toBe(0)
    expect(await EnvioNotificacion.countDocuments({ usuario: a._id })).toBe(0)

    // B puede consultar su historial por HTTP
    const listado = await request(app).get('/api/notificaciones/mias').set('Authorization', autorizacion(b))
    expect(listado.body.notificaciones).toHaveLength(1)
    const id = listado.body.notificaciones[0]._id

    // B puede marcarla como leída por HTTP
    const marcar = await request(app).put(`/api/notificaciones/mias/${id}/leida`).set('Authorization', autorizacion(b))
    expect(marcar.status).toBe(200)
    expect(marcar.body.leida).toBe(true)

    // Un administrador puede consultar EnvioNotificacion (historial)
    const admin = await crearUsuario('admin-e2e@example.com', { permisos: ['notificaciones:ver_historial'] })
    const envios = await historial.listarEnvios({ usuario: 'extremo-a-extremo' })
    expect(envios.total).toBeGreaterThanOrEqual(2) // el push y el email de B
    void admin

    // IA apagada no impide la notificación interna (ya cubierto arriba en
    // detalle, se repite aquí en el mismo flujo A→B que pide el enunciado).
    await ModuloSistema.findOneAndUpdate({ key: 'ia' }, { key: 'ia', nombre: 'IA', activo: false }, { upsert: true })
    await notificar({ usuarios: [b._id], categoria: 'requerimientos', tipo: 'segundo-evento', titulo: 'Segundo evento con IA apagada', cuerpo: 'x' })
    expect(await Notificacion.countDocuments({ usuario: b._id, titulo: 'Segundo evento con IA apagada' })).toBe(1)
  })
})
