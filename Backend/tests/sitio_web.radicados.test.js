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
import RegistroAuditoria from '../src/models/RegistroAuditoria.js'
import RespuestaRadicado from '../src/models/RespuestaRadicado.js'
import { enviarEmailRespuestaRadicado } from '../src/utils/email.js'
import { invalidarCacheModulos } from '../src/modules/sistema/sistema.service.js'

vi.mock('../src/utils/email.js', () => ({ enviarEmailGenerico: vi.fn(), enviarEmailRespuestaRadicado: vi.fn() }))

// Radicados del sitio (PQRSF…). WordPress se simula con un fetch falso: ninguna
// prueba toca el sitio real.
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

const respuestaWp = (cuerpo, { status = 200 } = {}) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { 'content-type': 'application/json' } })

const itemWp = (extra = {}) => ({
  id: 14,
  radicado: 'TTN-2026-0014',
  formulario: { id: 1, titulo: 'Portal PQRSF - Atención al Ciudadano' },
  estado: 'unread',
  fecha: '2026-10-22 17:19:00',
  resumen: { tipo: 'Queja', asunto: 'Cobro', solicitante: 'Ana', correo: 'ana@example.com' },
  ...extra,
})

let fetchMock
let gestor
const envOriginal = { ...env }

beforeEach(async () => {
  invalidarCacheModulos()
  env.WP_URL = 'https://sitio.test'
  env.WP_USER = 'prensa'
  env.WP_APP_PASSWORD = 'aaaa bbbb cccc'
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  gestor = await crearUsuario({ permisos: ['pqrs:gestionar'] })
})

afterEach(() => {
  vi.unstubAllGlobals()
  Object.assign(env, envOriginal)
})

describe('radicados del sitio web', () => {
  it('lista traduciendo estados a español y reenvía los filtros a WordPress', async () => {
    fetchMock.mockResolvedValue(respuestaWp({ items: [itemWp()], total: 1, totalPaginas: 1 }))

    const res = await request(app)
      .get('/api/sitio-web/radicados?estado=sin_leer&formularioId=1&buscar=cobro&limit=10')
      .set(auth(gestor))

    expect(res.status).toBe(200)
    expect(res.body.radicados[0]).toMatchObject({ radicado: 'TTN-2026-0014', estado: 'sin_leer' })
    const url = new URL(String(fetchMock.mock.calls[0][0]))
    expect(url.pathname).toBe('/wp-json/skynet/v1/radicados')
    expect(url.searchParams.get('estado')).toBe('unread')
    expect(url.searchParams.get('form_id')).toBe('1')
    expect(url.searchParams.get('per_page')).toBe('10')
  })

  it('rechaza un estado desconocido sin llamar a WordPress', async () => {
    const res = await request(app).get('/api/sitio-web/radicados?estado=archivado').set(auth(gestor))
    expect(res.status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('si falta el plugin puente avisa qué instalar en vez de "el contenido ya no existe"', async () => {
    fetchMock.mockResolvedValue(respuestaWp({ code: 'rest_no_route' }, { status: 404 }))
    const res = await request(app).get('/api/sitio-web/radicados').set(auth(gestor))
    expect(res.status).toBe(503)
    expect(res.body.message || res.body.error).toMatch(/Skynet Bridge/)
  })

  it('cambia el estado, lo traduce a WordPress y deja auditoría', async () => {
    fetchMock.mockResolvedValue(respuestaWp({ id: 14, estado: 'processed' }))

    const res = await request(app).put('/api/sitio-web/radicados/14/estado').set(auth(gestor)).send({ estado: 'tramitado' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ id: 14, estado: 'tramitado' })
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ estado: 'processed' })
    expect(await RegistroAuditoria.countDocuments({ modulo: 'sitio_web', entidad: 'radicado' })).toBe(1)
  })

  it('no acepta cambiar a un estado inventado', async () => {
    const res = await request(app).put('/api/sitio-web/radicados/14/estado').set(auth(gestor)).send({ estado: 'borrado' })
    expect(res.status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('sin pqrs:gestionar no se ve ni se cambia nada', async () => {
    const otro = await crearUsuario({ permisos: ['noticias:gestionar'] })
    const lista = await request(app).get('/api/sitio-web/radicados').set(auth(otro))
    const estado = await request(app).put('/api/sitio-web/radicados/14/estado').set(auth(otro)).send({ estado: 'leido' })
    expect(lista.status).toBe(403)
    expect(estado.status).toBe(403)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('con solo pqrs:gestionar (Operador) no se puede eliminar', async () => {
    const res = await request(app).delete('/api/sitio-web/radicados/14').set(auth(gestor))
    expect(res.status).toBe(403)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('pqrs:eliminar permite eliminar aunque no tenga sitio_web:gestionar', async () => {
    const borrador = await crearUsuario({ permisos: ['pqrs:gestionar', 'pqrs:eliminar'] })
    fetchMock.mockResolvedValue(respuestaWp({ id: 14 }))
    const res = await request(app).delete('/api/sitio-web/radicados/14').set(auth(borrador))
    expect(res.status).toBe(204)
  })

  it('elimina el radicado en WordPress y deja auditoría', async () => {
    const comunicador = await crearUsuario({ permisos: ['sitio_web:gestionar'] })
    fetchMock.mockResolvedValue(respuestaWp({ id: 14 }))

    const res = await request(app).delete('/api/sitio-web/radicados/14').set(auth(comunicador))

    expect(res.status).toBe(204)
    expect(fetchMock.mock.calls[0][1].method).toBe('DELETE')
    expect(new URL(String(fetchMock.mock.calls[0][0])).pathname).toBe('/wp-json/skynet/v1/radicados/14')
    expect(await RegistroAuditoria.countDocuments({ modulo: 'sitio_web', entidad: 'radicado', accion: 'eliminar' })).toBe(1)
  })

  it('exporta CSV con BOM, una columna por pregunta y neutraliza fórmulas del público', async () => {
    fetchMock.mockResolvedValue(
      respuestaWp({
        items: [
          {
            radicado: 'TTN-2026-0001',
            formulario: 'Portal PQRSF',
            estado: 'processed',
            fecha: '2026-09-17 11:50:00',
            ip: '1.2.3.4',
            campos: [
              { etiqueta: 'Asunto', valor: '=HYPERLINK("http://malo")' },
              { etiqueta: 'Mensaje', valor: 'hola; "mundo"\nlinea 2' },
            ],
          },
        ],
      }),
    )

    const res = await request(app).get('/api/sitio-web/radicados/exportar?estado=tramitado').set(auth(gestor))

    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toMatch(/text\/csv/)
    expect(res.headers['content-disposition']).toMatch(/attachment; filename="radicados-\d{4}-\d{2}-\d{2}\.csv"/)
    const texto = res.text
    expect(texto.charCodeAt(0)).toBe(0xfeff)
    expect(texto).toContain('Radicado;Formulario;Estado;Fecha;IP;Asunto;Mensaje')
    expect(texto).toContain("'=HYPERLINK")
    expect(texto).toContain('"hola; ""mundo""')
    expect(new URL(String(fetchMock.mock.calls[0][0])).searchParams.get('estado')).toBe('processed')
  })

  describe('respuesta al ciudadano', () => {
    const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n')
    const respuestaCreada = () => respuestaWp({ id: 3, nota: 'Su caso fue resuelto', archivoUrl: 'https://sitio.test/x.pdf', archivoNombre: 'respuesta.pdf' }, { status: 200 })
    const detalleWp = (extra = {}) => respuestaWp({ ...itemWp(), ip: '', navegador: '', campos: [], respuestas: [], ...extra })

    // WordPress falso: GET radicado, POST respuesta y POST estado.
    function wordpress({ radicado = detalleWp(), respuesta = respuestaCreada, estado = () => respuestaWp({ id: 14, estado: 'processed' }) } = {}) {
      fetchMock.mockImplementation(async (url, init = {}) => {
        const ruta = String(url)
        if (ruta.endsWith('/estado')) return estado()
        if (ruta.endsWith('/respuesta')) return respuesta()
        if ((init.method || 'GET') === 'GET') return radicado.clone()
        throw new Error(`llamada inesperada: ${ruta}`)
      })
    }
    const llamadaPost = (sufijo) => fetchMock.mock.calls.find(([url, init]) => String(url).endsWith(sufijo) && init?.method === 'POST')

    beforeEach(() => {
      enviarEmailRespuestaRadicado.mockReset()
      enviarEmailRespuestaRadicado.mockResolvedValue({ messageId: '<abc@smtp>' })
    })

    it('envía nota y PDF a WordPress, deja auditoría y puede marcar tramitado', async () => {
      wordpress()

      const res = await request(app)
        .post('/api/sitio-web/radicados/14/respuesta')
        .set(auth(gestor))
        .field('nota', 'Su caso fue resuelto')
        .field('marcarTramitado', 'true')
        .attach('archivo', PDF, { filename: 'respuesta.pdf', contentType: 'application/pdf' })

      expect(res.status).toBe(201)
      expect(res.body.respuesta.archivoUrl).toBe('https://sitio.test/x.pdf')
      expect(res.body.estado).toBe('tramitado')
      const envio = llamadaPost('/respuesta')
      expect(new URL(String(envio[0])).pathname).toBe('/wp-json/skynet/v1/radicados/14/respuesta')
      expect(envio[1].body.get('nota')).toBe('Su caso fue resuelto')
      expect(envio[1].body.get('archivo').type).toBe('application/pdf')
      expect(await RegistroAuditoria.countDocuments({ modulo: 'sitio_web', entidad: 'radicado', accion: 'crear' })).toBe(1)
    })

    it('envía la respuesta por correo al solicitante con el PDF adjunto y deja la constancia', async () => {
      wordpress()

      const res = await request(app)
        .post('/api/sitio-web/radicados/14/respuesta')
        .set(auth(gestor))
        .field('nota', 'Su caso fue resuelto')
        .attach('archivo', PDF, { filename: 'respuesta.pdf', contentType: 'application/pdf' })

      expect(res.status).toBe(201)
      expect(res.body.avisoCorreo).toBeUndefined()
      expect(res.body.constancia.correo).toMatchObject({ estado: 'enviado', destinatario: 'ana@example.com', adjuntoIncluido: true })

      expect(enviarEmailRespuestaRadicado).toHaveBeenCalledTimes(1)
      const enviado = enviarEmailRespuestaRadicado.mock.calls[0][0]
      expect(enviado).toMatchObject({ to: 'ana@example.com', radicado: 'TTN-2026-0014', solicitante: 'Ana', nota: 'Su caso fue resuelto' })
      expect(enviado.adjunto.contenido.equals(PDF)).toBe(true)

      const registro = await RespuestaRadicado.findOne({ radicadoId: 14 }).lean()
      expect(registro).toMatchObject({
        radicado: 'TTN-2026-0014',
        wpRespuestaId: 3,
        nota: 'Su caso fue resuelto',
        respondidoPor: { nombreUsuario: gestor.nombre_usuario, nombre: 'Persona Prueba' },
        correo: { estado: 'enviado', destinatario: 'ana@example.com', messageId: '<abc@smtp>', intentos: 1 },
      })
      expect(registro.archivo.sha256).toMatch(/^[0-9a-f]{64}$/)
    })

    it('con enviarCorreo=false publica sin enviar, lo deja registrado y se puede enviar después', async () => {
      wordpress()

      const res = await request(app)
        .post('/api/sitio-web/radicados/14/respuesta')
        .set(auth(gestor))
        .field('nota', 'Resuelto')
        .field('enviarCorreo', 'false')

      expect(res.status).toBe(201)
      expect(res.body.avisoCorreo).toBeUndefined()
      expect(res.body.constancia.correo).toMatchObject({ estado: 'no_enviado', destinatario: 'ana@example.com' })
      expect(enviarEmailRespuestaRadicado).not.toHaveBeenCalled()

      const envio = await request(app)
        .post(`/api/sitio-web/radicados/14/respuestas/${res.body.constancia.id}/reenviar-correo`)
        .set(auth(gestor))
      expect(envio.status).toBe(200)
      expect(envio.body.constancia.correo.estado).toBe('enviado')
      expect(enviarEmailRespuestaRadicado).toHaveBeenCalledTimes(1)
    })

    it('si el correo falla, la respuesta queda publicada, se avisa y se puede reenviar', async () => {
      wordpress()
      enviarEmailRespuestaRadicado.mockRejectedValueOnce(new Error('SMTP caído'))

      const res = await request(app).post('/api/sitio-web/radicados/14/respuesta').set(auth(gestor)).field('nota', 'Resuelto')

      expect(res.status).toBe(201)
      expect(res.body.respuesta.id).toBe(3)
      expect(res.body.avisoCorreo).toMatch(/NO se pudo enviar el correo a ana@example.com/)
      expect(res.body.constancia.correo).toMatchObject({ estado: 'fallido', error: 'SMTP caído' })

      const reenvio = await request(app)
        .post(`/api/sitio-web/radicados/14/respuestas/${res.body.constancia.id}/reenviar-correo`)
        .set(auth(gestor))
      expect(reenvio.status).toBe(200)
      expect(reenvio.body.constancia.correo).toMatchObject({ estado: 'enviado', destinatario: 'ana@example.com' })
      expect(enviarEmailRespuestaRadicado).toHaveBeenCalledTimes(2)
      expect((await RespuestaRadicado.findOne({ radicadoId: 14 }).lean()).correo.intentos).toBe(2)
    })

    it('sin correo válido del solicitante publica igual, no envía y lo deja registrado', async () => {
      wordpress({ radicado: detalleWp({ resumen: { tipo: 'Queja', asunto: 'Cobro', solicitante: 'Ana', correo: 'no-es-un-correo' } }) })

      const res = await request(app).post('/api/sitio-web/radicados/14/respuesta').set(auth(gestor)).field('nota', 'Resuelto')

      expect(res.status).toBe(201)
      expect(res.body.avisoCorreo).toMatch(/no trae un correo válido/)
      expect(res.body.constancia.correo.estado).toBe('sin_correo')
      expect(enviarEmailRespuestaRadicado).not.toHaveBeenCalled()

      const reenvio = await request(app).post(`/api/sitio-web/radicados/14/respuestas/${res.body.constancia.id}/reenviar-correo`).set(auth(gestor))
      expect(reenvio.status).toBe(400)
    })

    it('encuentra el correo por la etiqueta del campo si el resumen no lo trae', async () => {
      wordpress({
        radicado: detalleWp({
          resumen: { tipo: '', asunto: '', solicitante: 'Ana', correo: '' },
          campos: [{ clave: 'c', etiqueta: 'Correo electrónico', valor: ' Ana@Example.com ' }],
        }),
      })
      const res = await request(app).post('/api/sitio-web/radicados/14/respuesta').set(auth(gestor)).field('nota', 'Resuelto')
      expect(res.body.constancia.correo.destinatario).toBe('ana@example.com')
    })

    it('el detalle del radicado muestra quién respondió y el estado del correo de cada respuesta', async () => {
      const respuestas = [
        { id: 3, nota: 'Resuelto', archivoUrl: '', archivoNombre: '', autor: 'x', fecha: '2026-10-23 09:00:00' },
        { id: 2, nota: 'Vieja', archivoUrl: '', archivoNombre: '', autor: 'y', fecha: '2026-10-01 09:00:00' },
      ]
      wordpress({ radicado: detalleWp({ respuestas }) })
      await request(app).post('/api/sitio-web/radicados/14/respuesta').set(auth(gestor)).field('nota', 'Resuelto')

      const res = await request(app).get('/api/sitio-web/radicados/14').set(auth(gestor))

      expect(res.body.radicado.correoRespuesta).toBe('ana@example.com')
      const [nueva, anterior] = res.body.radicado.respuestas
      expect(nueva.constancia).toMatchObject({ respondidoPor: 'Persona Prueba', correo: { estado: 'enviado', destinatario: 'ana@example.com' } })
      expect(anterior.constancia).toBeNull()
    })

    it('si el radicado ya no existe no se publica nada', async () => {
      fetchMock.mockResolvedValue(respuestaWp({ code: 'skynet_no_existe' }, { status: 404 }))
      const res = await request(app).post('/api/sitio-web/radicados/14/respuesta').set(auth(gestor)).field('nota', 'Resuelto')
      expect(res.status).toBe(404)
      expect(llamadaPost('/respuesta')).toBeUndefined()
      expect(enviarEmailRespuestaRadicado).not.toHaveBeenCalled()
    })

    it('rechaza un archivo que dice ser PDF pero no lo es', async () => {
      const res = await request(app)
        .post('/api/sitio-web/radicados/14/respuesta')
        .set(auth(gestor))
        .field('nota', 'hola')
        .attach('archivo', Buffer.from('<?php echo 1; ?>'), { filename: 'malo.pdf', contentType: 'application/pdf' })
      expect(res.status).toBe(400)
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('exige nota o PDF y limita la nota a 3000 caracteres', async () => {
      const vacia = await request(app).post('/api/sitio-web/radicados/14/respuesta').set(auth(gestor)).field('nota', '   ')
      const larga = await request(app).post('/api/sitio-web/radicados/14/respuesta').set(auth(gestor)).field('nota', 'a'.repeat(3001))
      expect(vacia.status).toBe(400)
      expect(larga.status).toBe(400)
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('sin pqrs:gestionar no se puede ni subir el archivo ni reenviar el correo', async () => {
      const otro = await crearUsuario({ permisos: ['noticias:gestionar'] })
      const res = await request(app).post('/api/sitio-web/radicados/14/respuesta').set(auth(otro)).field('nota', 'x')
      const reenvio = await request(app).post('/api/sitio-web/radicados/14/respuestas/6543210fedcba9876543210f/reenviar-correo').set(auth(otro))
      expect(res.status).toBe(403)
      expect(reenvio.status).toBe(403)
    })
  })

  describe('endurecimiento tras la revisión', () => {
    it('"constructor" o "__proto__" no son estados válidos (400, no 502)', async () => {
      const a = await request(app).put('/api/sitio-web/radicados/14/estado').set(auth(gestor)).send({ estado: 'constructor' })
      const b = await request(app).get('/api/sitio-web/radicados?estado=__proto__').set(auth(gestor))
      expect(a.status).toBe(400)
      expect(b.status).toBe(400)
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('marcar leído al abrir es condicional: si WordPress ya lo tenía tramitado no se retrocede ni se audita', async () => {
      fetchMock.mockResolvedValue(respuestaWp({ id: 14, estado: 'processed' }))

      const res = await request(app).put('/api/sitio-web/radicados/14/estado').set(auth(gestor)).send({ estado: 'leido', soloSiSinLeer: true })

      expect(res.status).toBe(200)
      expect(res.body.estado).toBe('tramitado')
      expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ estado: 'read', solo_si_sin_leer: true })
      expect(await RegistroAuditoria.countDocuments({ modulo: 'sitio_web', entidad: 'radicado' })).toBe(0)
    })

    it('solo es "archivo adjunto" lo que está en las subidas del propio sitio', async () => {
      fetchMock.mockResolvedValue(
        respuestaWp({
          ...itemWp(),
          ip: '',
          navegador: '',
          campos: [
            { clave: 'a', etiqueta: 'Adjunto', valor: 'https://sitio.test/wp-content/uploads/2026/10/soporte.pdf' },
            { clave: 'b', etiqueta: 'Mensaje', valor: 'https://malo.test/wp-content/uploads/factura.pdf' },
            { clave: 'c', etiqueta: 'Otro', valor: 'https://sitio.test/otra-ruta/x.pdf' },
          ],
        }),
      )
      const res = await request(app).get('/api/sitio-web/radicados/14').set(auth(gestor))
      expect(res.body.radicado.campos.map((c) => c.adjunto)).toEqual([true, false, false])
    })

    it('si falla marcar tramitado, la respuesta ya publicada no devuelve error y avisa', async () => {
      enviarEmailRespuestaRadicado.mockResolvedValue({ messageId: '<m>' })
      fetchMock.mockImplementation(async (url) => {
        const ruta = String(url)
        if (ruta.endsWith('/estado')) return respuestaWp({ message: 'boom' }, { status: 500 })
        if (ruta.endsWith('/respuesta')) return respuestaWp({ id: 3, nota: 'ok', archivoUrl: '', archivoNombre: '' })
        return respuestaWp({ ...itemWp(), ip: '', navegador: '', campos: [], respuestas: [] })
      })
      const res = await request(app).post('/api/sitio-web/radicados/14/respuesta').set(auth(gestor)).field('nota', 'ok').field('marcarTramitado', 'true')
      expect(res.status).toBe(201)
      expect(res.body.respuesta.id).toBe(3)
      expect(res.body.avisoEstado).toMatch(/no se pudo marcar/)
    })
  })
})
