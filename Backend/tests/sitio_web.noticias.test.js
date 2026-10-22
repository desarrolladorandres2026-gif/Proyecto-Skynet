import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import bcrypt from 'bcryptjs'
import express from 'express'
import cookieParser from 'cookie-parser'
import request from 'supertest'
import jwt from 'jsonwebtoken'

import { env } from '../src/config/env.js'
import sitioWebRoutes from '../src/modules/sitio_web/sitio_web.routes.js'
import { textoAParrafos, sanitizarHtml, prepararContenido } from '../src/modules/sitio_web/html.js'
import { notFoundHandler, errorHandler } from '../src/middleware/errorHandler.js'
import Usuario from '../src/models/Usuario.js'
import Rol from '../src/models/Rol.js'
import Permiso from '../src/models/Permiso.js'
import RegistroAuditoria from '../src/models/RegistroAuditoria.js'
import { invalidarCacheModulos } from '../src/modules/sistema/sistema.service.js'

// Ninguna prueba toca el sitio real: fetch se reemplaza por un mock que
// registra la petición saliente y devuelve lo que cada caso necesite.
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

function crearApp() {
  const app = express()
  app.use(express.json())
  app.use(cookieParser())
  app.use('/api/sitio-web', sitioWebRoutes)
  app.use(notFoundHandler)
  app.use(errorHandler)
  return app
}

const app = crearApp()

function respuestaWp(cuerpo, { status = 200, cabeceras = {} } = {}) {
  return new Response(JSON.stringify(cuerpo), { status, headers: { 'content-type': 'application/json', ...cabeceras } })
}

const postWp = (extra = {}) => ({
  id: 99,
  date: '2026-10-22T10:00:00',
  modified: '2026-10-22T10:00:00',
  status: 'draft',
  title: { raw: 'Titulo', rendered: 'Titulo' },
  excerpt: { raw: '' },
  content: { raw: '<p>hola</p>' },
  link: 'https://elterminalneiva.com/?p=99',
  categories: [752],
  featured_media: 0,
  ...extra,
})

let editor
let sinPermiso
let fetchMock
const envOriginal = { ...env }

beforeEach(async () => {
  invalidarCacheModulos()
  env.WP_URL = 'https://sitio.test'
  env.WP_USER = 'prensa'
  env.WP_APP_PASSWORD = 'aaaa bbbb cccc'
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  editor = await crearUsuario({ permisos: ['noticias:gestionar'] })
  sinPermiso = await crearUsuario()
})

afterEach(() => {
  vi.unstubAllGlobals()
  Object.assign(env, envOriginal)
})

describe('textoAParrafos', () => {
  it('escapa HTML y separa párrafos', () => {
    expect(textoAParrafos('uno\n\n<script>x</script>')).toBe('<p>uno</p>\n<p>&lt;script&gt;x&lt;/script&gt;</p>')
  })
})

describe('sanitizarHtml', () => {
  it('quita scripts, handlers y javascript: pero conserva el formato permitido', () => {
    const limpio = sanitizarHtml(
      '<p onclick="x()">Hola <strong>mundo</strong><script>alert(1)</script></p><a href="javascript:alert(1)">mal</a><a href="https://a.co" target="_blank">ok</a>',
    )
    expect(limpio).toContain('<strong>mundo</strong>')
    expect(limpio).not.toMatch(/script|onclick|javascript:/i)
    expect(limpio).toContain('rel="noopener noreferrer"')
  })

  it('solo deja imágenes de https del propio sitio (y sus subdominios)', () => {
    const html =
      '<img src="https://sitio.test/a.png"><img src="https://webpage.sitio.test/b.png"><img src="https://otro.com/c.png"><img src="http://sitio.test/d.png"><img src="https://sitio.test.evil.com/e.png">'
    const limpio = sanitizarHtml(html)
    expect(limpio).toContain('sitio.test/a.png')
    expect(limpio).toContain('webpage.sitio.test/b.png')
    expect(limpio).not.toMatch(/otro\.com|http:\/\/|evil/)
  })

  it('prepararContenido distingue texto plano de HTML', () => {
    expect(prepararContenido('a < b')).toBe('<p>a &lt; b</p>')
    expect(prepararContenido('<p>x</p><script>y</script>')).toBe('<p>x</p>')
  })
})

describe('permisos', () => {
  it('rechaza sin noticias:gestionar y no llama a WordPress', async () => {
    const res = await request(app).get('/api/sitio-web/noticias').set(auth(sinPermiso))
    expect(res.status).toBe(403)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('crear noticia', () => {
  it('nace como borrador, con auth Basic y contenido escapado', async () => {
    fetchMock.mockResolvedValue(respuestaWp(postWp()))
    const res = await request(app)
      .post('/api/sitio-web/noticias')
      .set(auth(editor))
      .send({ titulo: 'Movilidad', contenido: '<b>hola</b>', categorias: [752] })

    expect(res.status).toBe(201)
    expect(res.body.noticia).toMatchObject({ id: 99, estado: 'draft' })

    const [url, opciones] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('https://sitio.test/wp-json/wp/v2/posts')
    expect(opciones.method).toBe('POST')
    expect(opciones.headers.Authorization).toBe(`Basic ${Buffer.from('prensa:aaaa bbbb cccc').toString('base64')}`)
    expect(JSON.parse(opciones.body)).toMatchObject({ title: 'Movilidad', status: 'draft', content: '<strong>hola</strong>', categories: [752] })

    expect(await RegistroAuditoria.countDocuments({ modulo: 'sitio_web', entidad: 'noticia', descripcion: /#99/ })).toBe(1)
  })

  it('exige título', async () => {
    const res = await request(app).post('/api/sitio-web/noticias').set(auth(editor)).send({ contenido: 'x' })
    expect(res.status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rechaza estados que Skynet no maneja', async () => {
    const res = await request(app).post('/api/sitio-web/noticias').set(auth(editor)).send({ titulo: 'x', estado: 'private' })
    expect(res.status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('listar / actualizar / eliminar', () => {
  it('lista con totales de las cabeceras de WordPress', async () => {
    fetchMock.mockResolvedValue(respuestaWp([postWp()], { cabeceras: { 'x-wp-total': '12', 'x-wp-totalpages': '1' } }))
    const res = await request(app).get('/api/sitio-web/noticias?limit=500').set(auth(editor))
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ total: 12, totalPaginas: 1 })
    expect(res.body.noticias).toHaveLength(1)
    expect(new URL(String(fetchMock.mock.calls[0][0])).searchParams.get('per_page')).toBe('50')
  })

  it('publicar registra la acción "publicar"', async () => {
    fetchMock.mockResolvedValue(respuestaWp(postWp({ status: 'publish' })))
    const res = await request(app).put('/api/sitio-web/noticias/99').set(auth(editor)).send({ estado: 'publish' })
    expect(res.status).toBe(200)
    expect(res.body.noticia.estado).toBe('publish')
    expect(await RegistroAuditoria.countDocuments({ accion: 'publicar', modulo: 'sitio_web', descripcion: /#99/ })).toBe(1)
  })

  it('eliminar manda a la papelera, no borra definitivamente', async () => {
    fetchMock.mockResolvedValue(respuestaWp({ deleted: false, previous: {} }))
    const res = await request(app).delete('/api/sitio-web/noticias/99').set(auth(editor))
    expect(res.status).toBe(204)
    const [url, opciones] = fetchMock.mock.calls[0]
    expect(opciones.method).toBe('DELETE')
    expect(new URL(String(url)).searchParams.get('force')).toBe('false')
  })

  it('rechaza un id que no es numérico', async () => {
    const res = await request(app).get('/api/sitio-web/noticias/abc').set(auth(editor))
    expect(res.status).toBe(400)
  })
})

describe('fallos de WordPress', () => {
  it('el mensaje 5xx propio SÍ llega al usuario (expose)', async () => {
    fetchMock.mockResolvedValue(respuestaWp({}, { status: 401 }))
    const res = await request(app).get('/api/sitio-web/noticias').set(auth(editor))
    expect(res.status).toBe(502)
    expect(res.body.error).toMatch(/rechazó las credenciales/)
  })

  it('credenciales rechazadas -> 502 sin filtrar el mensaje de WP', async () => {
    fetchMock.mockResolvedValue(respuestaWp({ code: 'incorrect_password', message: 'ruta interna /home/x' }, { status: 401 }))
    const res = await request(app).get('/api/sitio-web/noticias').set(auth(editor))
    expect(res.status).toBe(502)
    expect(JSON.stringify(res.body)).not.toContain('/home/x')
  })

  it('sin configuración -> 503', async () => {
    env.WP_APP_PASSWORD = undefined
    const res = await request(app).get('/api/sitio-web/noticias').set(auth(editor))
    expect(res.status).toBe(503)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('caída de red -> 504', async () => {
    fetchMock.mockRejectedValue(Object.assign(new Error('x'), { name: 'TimeoutError' }))
    const res = await request(app).get('/api/sitio-web/noticias').set(auth(editor))
    expect(res.status).toBe(504)
  })
})
