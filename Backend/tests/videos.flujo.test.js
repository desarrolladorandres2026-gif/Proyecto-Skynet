import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import bcrypt from 'bcryptjs'
import express from 'express'
import cookieParser from 'cookie-parser'
import request from 'supertest'
import jwt from 'jsonwebtoken'

// Cloudinary se simula: ningún test sube nada de verdad. cloudinaryConfigurado
// es un mock para poder probar también el caso "no configurado".
vi.mock('../src/config/cloudinary.js', () => ({
  cloudinaryConfigurado: vi.fn(() => true),
  subirImagen: vi.fn(async () => ({ secure_url: 'https://res.cloudinary.com/demo/miniatura-nueva.jpg', public_id: 'skynet/videos/nueva' })),
  eliminarImagen: vi.fn(async () => ({ result: 'ok' })),
}))

import { env } from '../src/config/env.js'
import videosRoutes from '../src/modules/videos/videos.routes.js'
import { notFoundHandler, errorHandler } from '../src/middleware/errorHandler.js'
import Usuario from '../src/models/Usuario.js'
import Rol from '../src/models/Rol.js'
import Permiso from '../src/models/Permiso.js'
import Video from '../src/models/Video.js'
import ModuloSistema from '../src/models/ModuloSistema.js'
import RegistroAuditoria from '../src/models/RegistroAuditoria.js'
import { invalidarCacheModulos } from '../src/modules/sistema/sistema.service.js'
import { contarReferenciasHistoricas } from '../src/modules/usuarios/usuarios.eliminacion.js'
import { analizarUrlVideo } from '../src/utils/videoUrl.js'
import { cloudinaryConfigurado, subirImagen, eliminarImagen } from '../src/config/cloudinary.js'
import { espacioInsuficiente } from '../src/modules/videos/videos.almacenamiento.js'

const URL_YT = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
const URL_YT_2 = 'https://youtu.be/9bZkp7q19f0'
const DIA = 24 * 60 * 60 * 1000

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
  app.use('/api/videos', videosRoutes)
  app.use(notFoundHandler)
  app.use(errorHandler)
  return app
}

// Inserta directo en la colección (sin pasar por la API) para controlar la
// fecha con exactitud al probar las consultas de lectura. `estado` solo sirve
// para sembrar documentos LEGADOS (de cuando existían borrador/desactivado).
let admin
let trabajador
async function sembrar(titulo, { estado, dias = 0, categoria = 'Seguridad', url = URL_YT, proveedor = 'youtube', videoId = 'dQw4w9WgXcQ', miniatura } = {}) {
  return Video.create({
    titulo,
    categoria,
    url,
    proveedor,
    videoId,
    ...(estado && { estado }),
    fechaPublicacion: new Date(Date.now() - dias * DIA),
    creadoPor: { usuario: admin._id, nombre: admin.nombre_usuario },
    ...(miniatura && { miniatura }),
  })
}

const app = crearApp()

// Los videos subidos van al disco (STORAGE_ROOT/videos): cada corrida usa su
// propia carpeta temporal para no ensuciar Backend/storage ni depender de ella.
let storageOriginal
let storagePrueba
beforeAll(() => {
  storageOriginal = env.STORAGE_ROOT
  storagePrueba = fs.mkdtempSync(path.join(os.tmpdir(), 'skynet-videos-'))
  env.STORAGE_ROOT = storagePrueba
})
afterAll(() => {
  env.STORAGE_ROOT = storageOriginal
  fs.rmSync(storagePrueba, { recursive: true, force: true })
})
const archivosEn = (carpeta) => {
  const dir = path.join(storagePrueba, carpeta)
  return fs.existsSync(dir) ? fs.readdirSync(dir) : []
}

beforeEach(async () => {
  vi.clearAllMocks()
  vi.mocked(cloudinaryConfigurado).mockReturnValue(true)
  invalidarCacheModulos()
  admin = await crearUsuario({ permisos: ['videos:gestionar'] })
  trabajador = await crearUsuario()
})

describe('analizarUrlVideo', () => {
  it('reconoce YouTube en sus formas habituales', () => {
    for (const url of [
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10s',
      'https://youtu.be/dQw4w9WgXcQ',
      'https://m.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://www.youtube.com/embed/dQw4w9WgXcQ',
      'https://www.youtube.com/shorts/dQw4w9WgXcQ',
    ]) {
      expect(analizarUrlVideo(url)).toMatchObject({ proveedor: 'youtube', videoId: 'dQw4w9WgXcQ' })
    }
  })

  it('reconoce Vimeo, con y sin hash de video no listado', () => {
    expect(analizarUrlVideo('https://vimeo.com/123456789')).toMatchObject({ proveedor: 'vimeo', videoId: '123456789', videoHash: '' })
    expect(analizarUrlVideo('https://vimeo.com/123456789/abcdef1234')).toMatchObject({ videoHash: 'abcdef1234' })
    expect(analizarUrlVideo('https://player.vimeo.com/video/123456789?h=abcdef1234')).toMatchObject({ proveedor: 'vimeo', videoHash: 'abcdef1234' })
  })

  it('clasifica archivos directos y enlaces externos', () => {
    expect(analizarUrlVideo('https://cdn.ejemplo.com/videos/induccion.mp4')).toMatchObject({ proveedor: 'archivo' })
    expect(analizarUrlVideo('https://intranet.ejemplo.com/capacitacion')).toMatchObject({ proveedor: 'externo' })
  })

  it('rechaza lo que no es una URL https utilizable', () => {
    for (const malo of [
      '',
      '   ',
      null,
      { $ne: '' },
      'no es una url',
      'http://youtu.be/dQw4w9WgXcQ',
      'javascript:alert(1)',
      'data:text/html,<script>1</script>',
      'https://user:clave@ejemplo.com/v.mp4',
      'https://www.youtube.com/@canalinstitucional',
      'https://vimeo.com/',
      `https://ejemplo.com/${'a'.repeat(2100)}.mp4`,
    ]) {
      expect(() => analizarUrlVideo(malo), String(malo).slice(0, 40)).toThrow()
    }
  })
})

describe('seguridad y permisos', () => {
  it('sin sesión: 401 en todo', async () => {
    expect((await request(app).get('/api/videos/destacado')).status).toBe(401)
    expect((await request(app).get('/api/videos/gestion')).status).toBe(401)
    expect((await request(app).post('/api/videos/gestion').send({})).status).toBe(401)
  })

  it('un trabajador SIN el permiso recibe 403 en crear, editar, listar-gestión y eliminar', async () => {
    const v = await sembrar('Existente')
    const h = auth(trabajador)
    const cuerpo = { titulo: 'Intento', categoria: 'X', url: URL_YT }

    expect((await request(app).get('/api/videos/gestion').set(h)).status).toBe(403)
    expect((await request(app).post('/api/videos/gestion').set(h).send(cuerpo)).status).toBe(403)
    expect((await request(app).put(`/api/videos/gestion/${v._id}`).set(h).send({ titulo: 'Hackeado' })).status).toBe(403)
    expect((await request(app).delete(`/api/videos/gestion/${v._id}`).set(h)).status).toBe(403)

    // Y nada cambió en la base
    expect(await Video.countDocuments()).toBe(1)
    expect((await Video.findById(v._id)).titulo).toBe('Existente')
  })

  it('ya no existe la ruta para cambiar estado', async () => {
    const v = await sembrar('X')
    expect((await request(app).patch(`/api/videos/gestion/${v._id}/estado`).set(auth(admin)).send({ estado: 'desactivado' })).status).toBe(404)
  })

  it('un trabajador sí puede ver el destacado, las categorías y el historial', async () => {
    await sembrar('Publicado')
    const h = auth(trabajador)
    expect((await request(app).get('/api/videos/destacado').set(h)).status).toBe(200)
    expect((await request(app).get('/api/videos/categorias').set(h)).status).toBe(200)
    expect((await request(app).get('/api/videos').set(h)).status).toBe(200)
  })

  it('el permiso NO se puede fingir desde el body', async () => {
    const res = await request(app)
      .post('/api/videos/gestion')
      .set(auth(trabajador))
      .send({ titulo: 'Intento', categoria: 'X', url: URL_YT, permisos: ['videos:gestionar'], esSuperAdmin: true })
    expect(res.status).toBe(403)
  })

  it('con el módulo "videos" desactivado, ni el trabajador ni el admin acceden', async () => {
    await ModuloSistema.create({ key: 'videos', nombre: 'Videos informativos', activo: false })
    invalidarCacheModulos()
    const r1 = await request(app).get('/api/videos/destacado').set(auth(trabajador))
    expect(r1.status).toBe(403)
    expect(r1.body.moduloDesactivado).toBe('videos')
    expect((await request(app).get('/api/videos/gestion').set(auth(admin))).status).toBe(403)
  })
})

describe('creación y video destacado', () => {
  it('al crear un video queda publicado de inmediato y aparece en el inicio', async () => {
    const antes = Date.now()
    const creado = await request(app)
      .post('/api/videos/gestion')
      .set(auth(admin))
      .send({ titulo: 'Bienvenida al Terminal', descripcion: 'Presentación', categoria: 'Comité SIG', url: URL_YT })
    expect(creado.status).toBe(201)
    expect(creado.body.video.estado).toBeUndefined()
    expect(creado.body.video.programado).toBe(false)
    expect(new Date(creado.body.video.fechaPublicacion).getTime()).toBeGreaterThanOrEqual(antes - 1000)

    const { body } = await request(app).get('/api/videos/destacado').set(auth(trabajador))
    expect(body.video).toMatchObject({
      titulo: 'Bienvenida al Terminal',
      categoria: 'Comité SIG',
      proveedor: 'youtube',
      esNuevo: true,
      embedUrl: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0&modestbranding=1',
      miniaturaUrl: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
    })
    // El destacado no expone datos administrativos
    expect(body.video.creadoPor).toBeUndefined()
  })

  it('un campo "estado" enviado desde el cliente se ignora (no puede ocultar ni crear borradores)', async () => {
    const res = await request(app).post('/api/videos/gestion').set(auth(admin)).send({ titulo: 'Con estado', categoria: 'X', url: URL_YT, estado: 'borrador' })
    expect(res.status).toBe(201)
    expect((await Video.findById(res.body.video.id)).estado).toBeUndefined()
    expect((await request(app).get('/api/videos/destacado').set(auth(trabajador))).body.video.titulo).toBe('Con estado')
  })

  it('un segundo video reemplaza al anterior como destacado', async () => {
    const h = auth(admin)
    const a = await request(app).post('/api/videos/gestion').set(h).send({ titulo: 'Primero', categoria: 'Seguridad', url: URL_YT })
    expect((await request(app).get('/api/videos/destacado').set(auth(trabajador))).body.video.id).toBe(a.body.video.id)

    await new Promise((r) => setTimeout(r, 15))
    const b = await request(app).post('/api/videos/gestion').set(h).send({ titulo: 'Segundo', categoria: 'Seguridad', url: URL_YT_2 })

    const destacado = (await request(app).get('/api/videos/destacado').set(auth(trabajador))).body.video
    expect(destacado.id).toBe(b.body.video.id)
    expect(destacado.titulo).toBe('Segundo')

    // El primero sigue en el historial
    const historial = (await request(app).get('/api/videos').set(auth(trabajador))).body
    expect(historial.videos.map((v) => v.titulo)).toEqual(['Segundo', 'Primero'])
  })

  it('el destacado es el de fecha de publicación más reciente, no el último CREADO', async () => {
    await sembrar('Creado primero pero publicado después', { dias: 1 })
    await sembrar('Creado después pero con fecha vieja', { dias: 30 })
    const { body } = await request(app).get('/api/videos/destacado').set(auth(trabajador))
    expect(body.video.titulo).toBe('Creado primero pero publicado después')
  })

  it('eliminar el destacado devuelve el lugar al anterior; sin videos no hay sección', async () => {
    const viejo = await sembrar('Viejo', { dias: 10 })
    const nuevo = await sembrar('Nuevo', { dias: 1 })
    const h = auth(admin)

    await request(app).delete(`/api/videos/gestion/${nuevo._id}`).set(h)
    expect((await request(app).get('/api/videos/destacado').set(auth(trabajador))).body.video.titulo).toBe('Viejo')

    await request(app).delete(`/api/videos/gestion/${viejo._id}`).set(h)
    expect((await request(app).get('/api/videos/destacado').set(auth(trabajador))).body.video).toBeNull()
  })

  it('con fecha FUTURA queda programado: invisible hasta que llegue', async () => {
    const res = await request(app)
      .post('/api/videos/gestion')
      .set(auth(admin))
      .send({ titulo: 'Programado', categoria: 'Seguridad', url: URL_YT, fechaPublicacion: '2099-01-01T08:00' })
    expect(res.status).toBe(201)
    expect(res.body.video.programado).toBe(true)
    expect((await request(app).get('/api/videos/destacado').set(auth(trabajador))).body.video).toBeNull()
    expect((await request(app).get('/api/videos').set(auth(trabajador))).body.total).toBe(0)
  })

  it('la fecha datetime-local se interpreta en hora del Terminal (UTC-5), no en la del servidor', async () => {
    const res = await request(app)
      .post('/api/videos/gestion')
      .set(auth(admin))
      .send({ titulo: 'Hora local', categoria: 'Seguridad', url: URL_YT, fechaPublicacion: '2026-03-10T14:30' })
    expect(res.body.video.fechaPublicacion).toBe('2026-03-10T19:30:00.000Z')
  })

  it('editar sin tocar la fecha la conserva (no salta a "más reciente")', async () => {
    const viejo = await sembrar('Viejo', { dias: 10 })
    await sembrar('Nuevo', { dias: 1 })
    const res = await request(app).put(`/api/videos/gestion/${viejo._id}`).set(auth(admin)).send({ titulo: 'Viejo editado' })
    expect(new Date(res.body.video.fechaPublicacion).getTime()).toBe(viejo.fechaPublicacion.getTime())
    expect((await request(app).get('/api/videos/destacado').set(auth(trabajador))).body.video.titulo).toBe('Nuevo')
  })

  it('la marca "Nuevo" solo la llevan los videos de la última semana', async () => {
    await sembrar('Reciente', { dias: 2 })
    await sembrar('Antiguo', { dias: 20 })
    const { body } = await request(app).get('/api/videos').set(auth(trabajador))
    expect(body.videos.find((v) => v.titulo === 'Reciente').esNuevo).toBe(true)
    expect(body.videos.find((v) => v.titulo === 'Antiguo').esNuevo).toBe(false)
  })
})

describe('videos legados (de cuando existían borrador/desactivado)', () => {
  it('siguen ocultos para el personal, en el inicio y en el historial', async () => {
    await sembrar('Visible', { dias: 5 })
    await sembrar('Borrador viejo', { estado: 'borrador', dias: 0 })
    await sembrar('Desactivado viejo', { estado: 'desactivado', dias: 0 })
    const h = auth(trabajador)
    expect((await request(app).get('/api/videos/destacado').set(h)).body.video.titulo).toBe('Visible')
    expect((await request(app).get('/api/videos').set(h)).body.videos.map((v) => v.titulo)).toEqual(['Visible'])
  })

  it('en gestión aparecen marcados como ocultos; editarlos los publica', async () => {
    const legado = await sembrar('Borrador viejo', { estado: 'borrador', dias: 0 })
    const lista = (await request(app).get('/api/videos/gestion').set(auth(admin))).body
    expect(lista.videos[0]).toMatchObject({ titulo: 'Borrador viejo', ocultoLegado: true })

    const res = await request(app).put(`/api/videos/gestion/${legado._id}`).set(auth(admin)).send({ titulo: 'Borrador viejo publicado' })
    expect(res.body.video.ocultoLegado).toBe(false)
    expect((await Video.findById(legado._id)).estado).toBeUndefined()
    expect((await request(app).get('/api/videos/destacado').set(auth(trabajador))).body.video.titulo).toBe('Borrador viejo publicado')
  })
})

describe('historial de videos', () => {
  it('lista con orden, categoría, rango de fechas, búsqueda y paginación', async () => {
    await sembrar('Alfa', { dias: 1, categoria: 'Seguridad' })
    await sembrar('Beta', { dias: 5, categoria: 'COPASST' })
    await sembrar('Gamma', { dias: 40, categoria: 'Seguridad' })
    const h = auth(trabajador)

    const todos = (await request(app).get('/api/videos').set(h)).body
    expect(todos.total).toBe(3)
    expect(todos.videos.map((v) => v.titulo)).toEqual(['Alfa', 'Beta', 'Gamma'])

    const antiguos = (await request(app).get('/api/videos?orden=antiguos').set(h)).body
    expect(antiguos.videos.map((v) => v.titulo)).toEqual(['Gamma', 'Beta', 'Alfa'])

    const porCategoria = (await request(app).get('/api/videos?categoria=Seguridad').set(h)).body
    expect(porCategoria.videos.map((v) => v.titulo)).toEqual(['Alfa', 'Gamma'])

    const hoy = new Date()
    const desde = new Date(hoy.getTime() - 10 * DIA).toISOString().slice(0, 10)
    const rango = (await request(app).get(`/api/videos?desde=${desde}`).set(h)).body
    expect(rango.videos.map((v) => v.titulo)).toEqual(['Alfa', 'Beta'])

    const hasta = new Date(hoy.getTime() - 20 * DIA).toISOString().slice(0, 10)
    expect((await request(app).get(`/api/videos?hasta=${hasta}`).set(h)).body.videos.map((v) => v.titulo)).toEqual(['Gamma'])

    expect((await request(app).get('/api/videos?q=bet').set(h)).body.videos.map((v) => v.titulo)).toEqual(['Beta'])

    const pag = (await request(app).get('/api/videos?limit=2&page=2').set(h)).body
    expect(pag).toMatchObject({ total: 3, page: 2, pages: 2 })
    expect(pag.videos.map((v) => v.titulo)).toEqual(['Gamma'])

    const categorias = (await request(app).get('/api/videos/categorias').set(h)).body.categorias
    expect(categorias).toEqual(['COPASST', 'Seguridad'])
  })

  it('un trabajador no ve los programados a futuro ni forzando parámetros', async () => {
    await sembrar('Futuro secreto', { dias: -3 })
    const h = auth(trabajador)
    for (const qs of ['', 'hasta=2099-12-31', 'orden=antiguos', 'estado=borrador', 'fechaPublicacion[$gt]=2000-01-01']) {
      const res = await request(app).get(`/api/videos?${qs}`).set(h)
      expect(res.status, qs).toBe(200)
      expect(res.body.total, qs).toBe(0)
    }
  })

  it('rechaza con 400 parámetros que no son texto (inyección de operadores) o fechas inválidas', async () => {
    const h = auth(trabajador)
    expect((await request(app).get('/api/videos?categoria[$ne]=x').set(h)).status).toBe(400)
    expect((await request(app).get('/api/videos?q[$regex]=.*').set(h)).status).toBe(400)
    expect((await request(app).get('/api/videos?desde=ayer').set(h)).status).toBe(400)
  })
})

describe('validaciones de gestión', () => {
  const base = { titulo: 'Título válido', categoria: 'Seguridad', url: URL_YT }
  const h = () => auth(admin)

  it('rechaza con 400 datos inválidos y no crea nada', async () => {
    const casos = [
      { ...base, titulo: 'ab' },
      { ...base, titulo: 'x'.repeat(141) },
      { ...base, titulo: undefined },
      { ...base, categoria: '' },
      { ...base, descripcion: 'x'.repeat(601) },
      { ...base, url: 'http://youtu.be/dQw4w9WgXcQ' },
      { ...base, url: 'javascript:alert(1)' },
      { ...base, fechaPublicacion: 'mañana' },
      { ...base, titulo: { $gt: '' } },
    ]
    for (const cuerpo of casos) {
      const res = await request(app).post('/api/videos/gestion').set(h()).send(cuerpo)
      expect(res.status, JSON.stringify(cuerpo).slice(0, 60)).toBe(400)
    }
    expect(await Video.countDocuments()).toBe(0)
  })

  it('un título que empieza con $ se guarda literal (no se interpreta como operador)', async () => {
    const res = await request(app).post('/api/videos/gestion').set(h()).send({ ...base, titulo: '$100 en premios' })
    expect(res.status).toBe(201)
    expect(res.body.video.titulo).toBe('$100 en premios')
  })

  it('id inválido o inexistente: 404', async () => {
    expect((await request(app).put('/api/videos/gestion/no-es-un-id').set(h()).send({ titulo: 'Nuevo título' })).status).toBe(404)
    expect((await request(app).put('/api/videos/gestion/64b7f0f0f0f0f0f0f0f0f0f0').set(h()).send({ titulo: 'Nuevo título' })).status).toBe(404)
    expect((await request(app).delete('/api/videos/gestion/64b7f0f0f0f0f0f0f0f0f0f0').set(h())).status).toBe(404)
  })

  it('editar cambia solo lo enviado y re-deduce el proveedor si cambia la URL', async () => {
    const v = await sembrar('Original', { categoria: 'Seguridad' })
    const res = await request(app).put(`/api/videos/gestion/${v._id}`).set(h()).send({ titulo: 'Editado', url: 'https://vimeo.com/123456789' })
    expect(res.status).toBe(200)
    expect(res.body.video).toMatchObject({ titulo: 'Editado', categoria: 'Seguridad', proveedor: 'vimeo', embedUrl: 'https://player.vimeo.com/video/123456789' })
    expect(res.body.video.actualizadoPor).toBe(admin.nombre_usuario)
  })

  it('el listado de gestión incluye los programados y marca cuáles lo están', async () => {
    await sembrar('Actual', { dias: 1 })
    await sembrar('Futuro', { dias: -5 })
    const todos = (await request(app).get('/api/videos/gestion').set(h())).body
    expect(todos.total).toBe(2)
    expect(todos.categorias).toEqual(['Seguridad'])
    expect(todos.videos.find((v) => v.titulo === 'Futuro').programado).toBe(true)
    expect(todos.videos.find((v) => v.titulo === 'Actual').programado).toBe(false)
  })

  it('eliminar quita el video y deja de aparecer en el inicio', async () => {
    const v = await sembrar('Efímero')
    expect((await request(app).delete(`/api/videos/gestion/${v._id}`).set(h())).status).toBe(204)
    expect(await Video.countDocuments()).toBe(0)
    expect((await request(app).get('/api/videos/destacado').set(auth(trabajador))).body.video).toBeNull()
  })
})

describe('miniatura', () => {
  const base = { titulo: 'Con miniatura', categoria: 'Seguridad', url: URL_YT }
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')

  it('sube la miniatura a Cloudinary y la usa en lugar de la de YouTube', async () => {
    const res = await request(app)
      .post('/api/videos/gestion')
      .set(auth(admin))
      .field('titulo', base.titulo)
      .field('categoria', base.categoria)
      .field('url', base.url)
      .attach('miniatura', png, { filename: 'm.png', contentType: 'image/png' })
    expect(res.status).toBe(201)
    expect(subirImagen).toHaveBeenCalledTimes(1)
    expect(res.body.video.miniaturaUrl).toBe('https://res.cloudinary.com/demo/miniatura-nueva.jpg')
    expect(res.body.video.tieneMiniaturaPropia).toBe(true)
  })

  it('rechaza con 400 un archivo que no es imagen', async () => {
    const res = await request(app)
      .post('/api/videos/gestion')
      .set(auth(admin))
      .field('titulo', base.titulo)
      .field('categoria', base.categoria)
      .field('url', base.url)
      .attach('miniatura', Buffer.from('#!/bin/sh'), { filename: 'x.sh', contentType: 'application/x-sh' })
    expect(res.status).toBe(400)
    expect(subirImagen).not.toHaveBeenCalled()
    expect(await Video.countDocuments()).toBe(0)
  })

  it('reemplazar la miniatura borra la anterior de Cloudinary; quitarla, también', async () => {
    const v = await sembrar('Con foto', { miniatura: { url: 'https://res.cloudinary.com/demo/vieja.jpg', publicId: 'skynet/videos/vieja' } })
    const reemplazo = await request(app)
      .put(`/api/videos/gestion/${v._id}`)
      .set(auth(admin))
      .field('titulo', 'Con foto nueva')
      .attach('miniatura', png, { filename: 'm.png', contentType: 'image/png' })
    expect(reemplazo.status).toBe(200)
    expect(eliminarImagen).toHaveBeenCalledWith('skynet/videos/vieja')

    vi.mocked(eliminarImagen).mockClear()
    const quitada = await request(app).put(`/api/videos/gestion/${v._id}`).set(auth(admin)).field('quitarMiniatura', 'true')
    expect(quitada.status).toBe(200)
    expect(eliminarImagen).toHaveBeenCalledWith('skynet/videos/nueva')
    expect(quitada.body.video.tieneMiniaturaPropia).toBe(false)
  })

  it('si Cloudinary falla al subir (502), el admin ve el motivo y el video no se crea', async () => {
    vi.mocked(subirImagen).mockRejectedValueOnce(new Error('timeout de red'))
    const res = await request(app)
      .post('/api/videos/gestion')
      .set(auth(admin))
      .field('titulo', base.titulo)
      .field('categoria', base.categoria)
      .field('url', base.url)
      .attach('miniatura', png, { filename: 'm.png', contentType: 'image/png' })
    expect(res.status).toBe(502)
    expect(res.body.error).toMatch(/No se pudo subir la miniatura/)
    expect(await Video.countDocuments()).toBe(0)
  })

  it('eliminar el video borra su miniatura', async () => {
    const v = await sembrar('Con foto', { miniatura: { url: 'https://res.cloudinary.com/demo/a.jpg', publicId: 'skynet/videos/a' } })
    await request(app).delete(`/api/videos/gestion/${v._id}`).set(auth(admin))
    expect(eliminarImagen).toHaveBeenCalledWith('skynet/videos/a')
  })

  it('sin Cloudinary configurado, subir miniatura da 503 y no crea el video (sin ella, todo sigue funcionando)', async () => {
    vi.mocked(cloudinaryConfigurado).mockReturnValue(false)
    const conArchivo = await request(app)
      .post('/api/videos/gestion')
      .set(auth(admin))
      .field('titulo', base.titulo)
      .field('categoria', base.categoria)
      .field('url', base.url)
      .attach('miniatura', png, { filename: 'm.png', contentType: 'image/png' })
    expect(conArchivo.status).toBe(503)
    // El mensaje real llega al administrador (errorHandler enmascara los 5xx)
    expect(conArchivo.body.error).toMatch(/almacenamiento de imágenes/)
    expect(await Video.countDocuments()).toBe(0)

    const sinArchivo = await request(app).post('/api/videos/gestion').set(auth(admin)).send(base)
    expect(sinArchivo.status).toBe(201)
  })
})

describe('auditoría e integridad', () => {
  it('crear, editar y eliminar dejan rastro en la auditoría', async () => {
    const h = auth(admin)
    const creado = await request(app).post('/api/videos/gestion').set(h).send({ titulo: 'Auditable', categoria: 'Seguridad', url: URL_YT })
    const id = creado.body.video.id
    await request(app).put(`/api/videos/gestion/${id}`).set(h).send({ titulo: 'Auditable v2' })
    await request(app).delete(`/api/videos/gestion/${id}`).set(h)

    const acciones = (await RegistroAuditoria.find({ modulo: 'videos' }).sort({ creadoEn: 1 })).map((r) => r.accion)
    expect(acciones.sort()).toEqual(['actualizar', 'crear', 'eliminar'])
  })

  it('un usuario que creó videos cuenta como historial institucional (no se puede borrar físicamente)', async () => {
    await sembrar('Institucional')
    const { total, detalle } = await contarReferenciasHistoricas(admin._id)
    expect(total).toBeGreaterThan(0)
    expect(detalle.map((d) => d.etiqueta)).toContain('Videos informativos')
    expect((await contarReferenciasHistoricas(trabajador._id)).total).toBe(0)
  })
})

// Cabecera ISO BMFF real ('ftyp' + marca) seguida de relleno: suficiente para
// que la verificación de magic bytes lo reconozca como MP4/MOV.
function videoFalso(marca = 'mp42', relleno = 4096) {
  const ftyp = Buffer.concat([
    Buffer.from([0x00, 0x00, 0x00, 0x18]),
    Buffer.from('ftyp'),
    Buffer.from(marca),
    Buffer.from([0, 0, 0, 0]),
    Buffer.from('isom'),
    Buffer.from('mp42'),
  ])
  return Buffer.concat([ftyp, Buffer.alloc(relleno, 7)])
}

describe('subida de archivos de video al VPS', () => {
  // tests/setup.js vacía la base entre tests, pero no el disco.
  beforeEach(() => {
    for (const carpeta of ['videos', 'videos_temp']) fs.rmSync(path.join(storagePrueba, carpeta), { recursive: true, force: true })
  })

  const campos = (req, extra = {}) => {
    const datos = { titulo: 'Video subido', categoria: 'Talento Humano', ...extra }
    for (const [k, v] of Object.entries(datos)) req.field(k, v)
    return req
  }
  const subir = (extra, archivo = videoFalso(), opciones = { filename: 'induccion.mp4', contentType: 'video/mp4' }) =>
    campos(request(app).post('/api/videos/gestion').set(auth(admin)), extra).attach('video', archivo, opciones)

  it('crea el video con el archivo guardado en disco, sin URL, y lo deja listo para reproducir', async () => {
    const res = await subir({})
    expect(res.status).toBe(201)
    expect(res.body.video).toMatchObject({
      proveedor: 'local',
      url: '',
      embedUrl: null,
      archivoNombreOriginal: 'induccion.mp4',
      archivoTamano: videoFalso().length,
    })
    expect(res.body.video.archivoVersion).toMatch(/^\d+_[0-9a-f]{16}$/)
    expect(archivosEn('videos')).toHaveLength(1)
    expect(archivosEn('videos_temp')).toHaveLength(0)

    const destacado = (await request(app).get('/api/videos/destacado').set(auth(trabajador))).body.video
    expect(destacado.id).toBe(res.body.video.id)
    expect(destacado.archivoVersion).toBe(res.body.video.archivoVersion)
  })

  it('un trabajador reproduce el publicado por rangos (adelantar/retroceder)', async () => {
    const { body } = await subir({})
    const url = `/api/videos/${body.video.id}/archivo`
    const total = videoFalso().length

    const completo = await request(app).get(url).set(auth(trabajador)).buffer(true).parse((r, cb) => {
      const trozos = []
      r.on('data', (c) => trozos.push(c))
      r.on('end', () => cb(null, Buffer.concat(trozos)))
    })
    expect(completo.status).toBe(200)
    expect(completo.headers['content-type']).toBe('video/mp4')
    expect(completo.headers['accept-ranges']).toBe('bytes')
    expect(completo.headers['cache-control']).toBe('private, max-age=604800')
    expect(completo.body.length).toBe(total)

    const parcial = await request(app).get(url).set(auth(trabajador)).set('Range', 'bytes=0-9')
    expect(parcial.status).toBe(206)
    expect(parcial.headers['content-range']).toBe(`bytes 0-9/${total}`)
    expect(Number(parcial.headers['content-length'])).toBe(10)

    const fueraDeRango = await request(app).get(url).set(auth(trabajador)).set('Range', `bytes=${total + 10}-`)
    expect(fueraDeRango.status).toBe(416)
  })

  it('el archivo de un programado: 404 para el trabajador, visible para quien gestiona (previsualizar)', async () => {
    const { body } = await subir({ fechaPublicacion: '2099-01-01T08:00' })
    const url = `/api/videos/${body.video.id}/archivo`
    expect((await request(app).get(url).set(auth(trabajador))).status).toBe(404)
    expect((await request(app).get(url).set(auth(admin))).status).toBe(200)
    expect((await request(app).get(url)).status).toBe(401)
    expect((await request(app).get('/api/videos/no-es-id/archivo').set(auth(admin))).status).toBe(404)
  })

  it('un .mov se sirve como video/mp4 (Chrome/Edge no reproducen "video/quicktime")', async () => {
    const { body } = await subir({}, videoFalso('qt  '), { filename: 'celular.MOV', contentType: 'video/quicktime' })
    const res = await request(app).get(`/api/videos/${body.video.id}/archivo`).set(auth(trabajador)).set('Range', 'bytes=0-3')
    expect(res.status).toBe(206)
    expect(res.headers['content-type']).toBe('video/mp4')
  })

  it('acepta un .mp4 que el navegador mandó como application/octet-stream (verifica el contenido real)', async () => {
    const res = await subir({}, videoFalso(), { filename: 'clip.mp4', contentType: 'application/octet-stream' })
    expect(res.status).toBe(201)
    expect(res.body.video.proveedor).toBe('local')
  })

  it('rechaza con 400 formatos que el navegador no reproduce y contenido falso, sin dejar archivos', async () => {
    const avi = await subir({}, Buffer.from('RIFF....AVI LIST'), { filename: 'viejo.avi', contentType: 'video/x-msvideo' })
    expect(avi.status).toBe(400)
    expect(avi.body.error).toMatch(/Formato de video no compatible/)

    const falso = await subir({}, Buffer.from('#!/bin/sh\necho hola\n'.repeat(50)), { filename: 'video.mp4', contentType: 'video/mp4' })
    expect(falso.status).toBe(400)

    expect(await Video.countDocuments()).toBe(0)
    expect(archivosEn('videos')).toHaveLength(0)
    expect(archivosEn('videos_temp')).toHaveLength(0)
  })

  it('si los datos del formulario son inválidos, el video subido se descarta', async () => {
    const res = await subir({ titulo: 'ab' })
    expect(res.status).toBe(400)
    expect(await Video.countDocuments()).toBe(0)
    expect(archivosEn('videos')).toHaveLength(0)
    expect(archivosEn('videos_temp')).toHaveLength(0)
  })

  it('sin archivo ni URL: 400 con un mensaje que explica las dos opciones', async () => {
    const res = await request(app).post('/api/videos/gestion').set(auth(admin)).send({ titulo: 'Sin fuente', categoria: 'X' })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/Sube un archivo de video o indica la URL/)
  })

  it('un trabajador sin permiso no puede subir: 403 y nada llega al disco', async () => {
    const res = await campos(request(app).post('/api/videos/gestion').set(auth(trabajador))).attach('video', videoFalso(), { filename: 'x.mp4', contentType: 'video/mp4' })
    expect(res.status).toBe(403)
    expect(archivosEn('videos')).toHaveLength(0)
    expect(archivosEn('videos_temp')).toHaveLength(0)
  })

  it('reemplazar el archivo borra el anterior; cambiar a URL borra el archivo; editar sin archivo lo conserva', async () => {
    const { body } = await subir({})
    const id = body.video.id
    const [original] = archivosEn('videos')

    const soloTitulo = await request(app).put(`/api/videos/gestion/${id}`).set(auth(admin)).field('titulo', 'Nuevo título')
    expect(soloTitulo.status).toBe(200)
    expect(soloTitulo.body.video.proveedor).toBe('local')
    expect(archivosEn('videos')).toEqual([original])

    const reemplazo = await request(app)
      .put(`/api/videos/gestion/${id}`)
      .set(auth(admin))
      .attach('video', videoFalso('mp42', 8000), { filename: 'v2.mp4', contentType: 'video/mp4' })
    expect(reemplazo.status).toBe(200)
    expect(reemplazo.body.video.archivoNombreOriginal).toBe('v2.mp4')
    expect(reemplazo.body.video.archivoVersion).not.toBe(body.video.archivoVersion)
    const actuales = archivosEn('videos')
    expect(actuales).toHaveLength(1)
    expect(actuales[0]).not.toBe(original)

    const aUrl = await request(app).put(`/api/videos/gestion/${id}`).set(auth(admin)).field('url', URL_YT)
    expect(aUrl.status).toBe(200)
    expect(aUrl.body.video).toMatchObject({ proveedor: 'youtube', archivoNombreOriginal: null, archivoVersion: null })
    expect(archivosEn('videos')).toHaveLength(0)
    expect((await request(app).get(`/api/videos/${id}/archivo`).set(auth(admin))).status).toBe(404)
  })

  it('eliminar el video borra su archivo del disco', async () => {
    const { body } = await subir({})
    expect(archivosEn('videos')).toHaveLength(1)
    expect((await request(app).delete(`/api/videos/gestion/${body.video.id}`).set(auth(admin))).status).toBe(204)
    expect(archivosEn('videos')).toHaveLength(0)
  })

  it('una miniatura de más de 5 MB se rechaza (el video no tiene tope, la miniatura sí)', async () => {
    const res = await campos(request(app).post('/api/videos/gestion').set(auth(admin)))
      .attach('miniatura', Buffer.alloc(5 * 1024 * 1024 + 1, 1), { filename: 'enorme.png', contentType: 'image/png' })
      .attach('video', videoFalso(), { filename: 'v.mp4', contentType: 'video/mp4' })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/5 MB/)
    expect(archivosEn('videos_temp')).toHaveLength(0)
  })

  it('espacio en disco: se rechaza si la subida dejaría el disco por debajo del margen', () => {
    const GB = 1024 ** 3
    expect(espacioInsuficiente({ solicitados: 1 * GB, libres: 10 * GB })).toBe(false)
    expect(espacioInsuficiente({ solicitados: 9 * GB, libres: 10 * GB })).toBe(true) // quedaría < 2 GB
    expect(espacioInsuficiente({ solicitados: 100, libres: 50, margen: 0 })).toBe(true)
  })
})
