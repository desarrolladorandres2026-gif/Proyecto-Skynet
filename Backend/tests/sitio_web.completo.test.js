import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import bcrypt from 'bcryptjs'
import express from 'express'
import cookieParser from 'cookie-parser'
import request from 'supertest'
import jwt from 'jsonwebtoken'

import { env } from '../src/config/env.js'
import sitioWebRoutes from '../src/modules/sitio_web/sitio_web.routes.js'
import { notFoundHandler, errorHandler } from '../src/middleware/errorHandler.js'
import Usuario from '../src/models/Usuario.js'
import Rol from '../src/models/Rol.js'
import Permiso from '../src/models/Permiso.js'
import { invalidarCacheModulos } from '../src/modules/sistema/sistema.service.js'

// Eventos, avisos (popups), medios, resumen y imagen destacada. WordPress se
// simula con un fetch falso: ninguna prueba toca el sitio real.
async function crearUsuario({ permisos = [] } = {}) {
  const docs = []
  for (const codigo of permisos) {
    const [modulo, accion] = codigo.split(':')
    docs.push(await Permiso.findOneAndUpdate({ codigo }, { codigo, modulo, accion, nombre: codigo }, { upsert: true, new: true }))
  }
  const sufijo = Math.random().toString(36).slice(2)
  const rol = await Rol.create({ nombre: `Rol-${sufijo}`, slug: `rol-${sufijo}`, permisos: docs.map((p) => p._id) })
  return Usuario.create({
    nombre_usuario: `user-${sufijo}`,
    nombre: 'Persona Prueba',
    password: await bcrypt.hash('clave-segura-123', 4),
    email: `${sufijo}@example.com`,
    rol: rol._id,
    estado: 'activo',
  })
}

function auth(usuario) {
  const token = jwt.sign({ id_usuario: usuario._id.toString(), tokenVersion: usuario.tokenVersion }, env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' })
  return { Authorization: `Bearer ${token}` }
}

const app = express()
app.use(express.json())
app.use(cookieParser())
app.use('/api/sitio-web', sitioWebRoutes)
app.use(notFoundHandler)
app.use(errorHandler)

const respuestaWp = (cuerpo, { status = 200, cabeceras = {} } = {}) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { 'content-type': 'application/json', ...cabeceras } })

const postWp = (extra = {}) => ({
  id: 99,
  date: '2026-10-22T10:00:00',
  modified: '2026-10-22T10:00:00',
  status: 'draft',
  title: { raw: 'Titulo' },
  excerpt: { raw: '' },
  content: { raw: '<p>hola</p>' },
  link: 'https://sitio.test/?p=99',
  categories: [],
  featured_media: 0,
  ...extra,
})

let fetchMock
let editor
const envOriginal = { ...env }

beforeEach(async () => {
  invalidarCacheModulos()
  env.WP_URL = 'https://sitio.test'
  env.WP_USER = 'prensa'
  env.WP_APP_PASSWORD = 'aaaa bbbb cccc'
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  editor = await crearUsuario({ permisos: ['noticias:gestionar'] })
})

afterEach(() => {
  vi.unstubAllGlobals()
  Object.assign(env, envOriginal)
})

describe('imagen destacada y programación', () => {
  it('devuelve la URL de la imagen embebida y reenvía fecha y destacada', async () => {
    fetchMock.mockResolvedValue(
      respuestaWp(
        postWp({
          featured_media: 5,
          sticky: true,
          status: 'future',
          _embedded: { 'wp:featuredmedia': [{ source_url: 'https://sitio.test/full.jpg', media_details: { sizes: { medium_large: { source_url: 'https://sitio.test/ml.jpg' } } } }] },
        }),
      ),
    )
    const res = await request(app)
      .post('/api/sitio-web/noticias')
      .set(auth(editor))
      .send({ titulo: 'Con foto', imagenId: 5, estado: 'publish', fechaPublicacion: '2026-12-01T08:30', destacada: true })
    expect(res.status).toBe(201)
    expect(res.body.noticia).toMatchObject({ imagenUrl: 'https://sitio.test/ml.jpg', destacada: true, estado: 'future' })
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ featured_media: 5, date: '2026-12-01T08:30', sticky: true, status: 'publish' })
  })

  it('rechaza una fecha mal formada', async () => {
    const res = await request(app).post('/api/sitio-web/noticias').set(auth(editor)).send({ titulo: 'x', fechaPublicacion: 'mañana' })
    expect(res.status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('medios', () => {
  // PNG mínimo válido (1x1)
  const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')

  it('sin ningún permiso del módulo no puede ni subir', async () => {
    const nadie = await crearUsuario()
    const res = await request(app).post('/api/sitio-web/medios').set(auth(nadie)).attach('archivo', PNG, 'a.png')
    expect(res.status).toBe(403)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('sube una imagen real y la extensión sale del contenido, no del nombre', async () => {
    fetchMock.mockResolvedValue(respuestaWp({ id: 77, title: { raw: 'x' }, source_url: 'https://sitio.test/x.png', media_details: {} }, { status: 201 }))
    const res = await request(app).post('/api/sitio-web/medios').set(auth(editor)).attach('archivo', PNG, 'Foto Ñandú.exe')
    expect(res.status).toBe(201)
    expect(res.body.medio).toMatchObject({ id: 77 })
    expect(fetchMock.mock.calls[0][1].body.get('file').name).toBe('Foto-Nandu.png')
  })

  it('rechaza un archivo que dice ser imagen pero no lo es', async () => {
    const res = await request(app)
      .post('/api/sitio-web/medios')
      .set(auth(editor))
      .attach('archivo', Buffer.from('<?php echo 1; ?>'), { filename: 'a.png', contentType: 'image/png' })
    expect(res.status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('eventos', () => {
  const eventoWp = (extra = {}) => ({
    id: 5,
    title: 'Feria',
    description: '<p>x</p>',
    start_date: '2026-12-01 08:00:00',
    end_date: '2026-12-01 12:00:00',
    all_day: false,
    status: 'draft',
    url: 'https://sitio.test/e',
    venue: { id: 31567, venue: 'Terminal' },
    ...extra,
  })

  it('exige eventos:gestionar (noticias:gestionar no basta)', async () => {
    const res = await request(app).get('/api/sitio-web/eventos').set(auth(editor))
    expect(res.status).toBe(403)
  })

  it('crea como borrador, normaliza fechas y valida el orden', async () => {
    const gestor = await crearUsuario({ permisos: ['eventos:gestionar'] })
    fetchMock.mockResolvedValue(respuestaWp(eventoWp()))
    const ok = await request(app)
      .post('/api/sitio-web/eventos')
      .set(auth(gestor))
      .send({ titulo: 'Feria', inicio: '2026-12-01T08:00', fin: '2026-12-01T12:00', sedeId: 31567 })
    expect(ok.status).toBe(201)
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      title: 'Feria',
      start_date: '2026-12-01 08:00:00',
      end_date: '2026-12-01 12:00:00',
      status: 'draft',
      venue: 31567,
    })

    fetchMock.mockClear()
    const mal = await request(app)
      .post('/api/sitio-web/eventos')
      .set(auth(gestor))
      .send({ titulo: 'x', inicio: '2026-12-02T08:00', fin: '2026-12-01T08:00' })
    expect(mal.status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('lista desde el endpoint estándar y completa fechas con el detalle del calendario; si el detalle falla, el evento igual aparece', async () => {
    const gestor = await crearUsuario({ permisos: ['eventos:gestionar'] })
    fetchMock.mockImplementation(async (url) => {
      const u = String(url)
      if (u.includes('/wp/v2/tribe_events')) {
        return respuestaWp([{ id: 5, status: 'draft', title: { raw: 'Feria' } }, { id: 6, status: 'publish', title: { raw: 'Sin detalle' } }], {
          cabeceras: { 'x-wp-total': '2', 'x-wp-totalpages': '1' },
        })
      }
      if (u.includes('/events/5')) return respuestaWp(eventoWp())
      return respuestaWp({}, { status: 401 })
    })
    const res = await request(app).get('/api/sitio-web/eventos').set(auth(gestor))
    expect(res.status).toBe(200)
    expect(res.body.total).toBe(2)
    expect(res.body.eventos.map((e) => [e.id, e.titulo, e.inicio])).toEqual([
      [5, 'Feria', '2026-12-01 08:00:00'],
      [6, 'Sin detalle', undefined],
    ])
  })
})

describe('avisos', () => {
  const popupWp = (extra = {}) => ({
    id: 9,
    title: { raw: 'Aviso' },
    content: { raw: '<p>x</p>' },
    status: 'draft',
    enabled: false,
    settings: { triggers: [{ type: 'auto_open' }] },
    modified: '2026-10-22T10:00:00',
    ...extra,
  })

  it('exige publicaciones:gestionar', async () => {
    const res = await request(app).get('/api/sitio-web/avisos').set(auth(editor))
    expect(res.status).toBe(403)
  })

  it('un aviso nuevo copia los ajustes de la plantilla y nace oculto', async () => {
    const gestor = await crearUsuario({ permisos: ['publicaciones:gestionar'] })
    fetchMock
      .mockResolvedValueOnce(respuestaWp([popupWp({ status: 'publish', enabled: true })]))
      .mockResolvedValueOnce(respuestaWp(popupWp()))
    const res = await request(app).post('/api/sitio-web/avisos').set(auth(gestor)).send({ titulo: 'Nuevo', contenido: 'Hola' })
    expect(res.status).toBe(201)
    expect(res.body.aviso).toMatchObject({ visible: false })
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({
      status: 'draft',
      enabled: false,
      settings: { triggers: [{ type: 'auto_open' }] },
    })
  })

  it('visible = publicado Y activado', async () => {
    const gestor = await crearUsuario({ permisos: ['publicaciones:gestionar'] })
    fetchMock.mockResolvedValue(respuestaWp([popupWp({ status: 'publish', enabled: false }), popupWp({ id: 10, status: 'publish', enabled: true })]))
    const res = await request(app).get('/api/sitio-web/avisos').set(auth(gestor))
    expect(res.body.avisos.map((a) => a.visible)).toEqual([false, true])
  })
})

describe('resumen', () => {
  it('un bloque que falla no tumba a los demás', async () => {
    fetchMock.mockImplementation(async (url) => {
      const u = String(url)
      if (u.includes('/tribe_events')) return respuestaWp({}, { status: 500 })
      if (u.includes('/users/me')) return respuestaWp({ name: 'Prensa', roles: ['administrator'] })
      if (u.includes('/popups')) return respuestaWp([{ id: 1, status: 'publish', enabled: true }])
      return respuestaWp([], { cabeceras: { 'x-wp-total': '3' } })
    })
    const res = await request(app).get('/api/sitio-web/resumen').set(auth(editor))
    expect(res.status).toBe(200)
    expect(res.body.conexion).toMatchObject({ ok: true, usuario: 'Prensa' })
    expect(res.body.eventos).toBeNull()
    expect(res.body.noticias).toEqual({ publicadas: 3, borradores: 3, programadas: 3 })
    expect(res.body.avisos).toEqual({ total: 1, visibles: 1 })
  })
})
