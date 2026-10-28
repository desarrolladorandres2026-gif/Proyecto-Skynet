import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../src/utils/sendPush.js', () => ({ notificarUsuarios: vi.fn().mockResolvedValue(undefined) }))

import { env } from '../src/config/env.js'
import Usuario from '../src/models/Usuario.js'
import Rol from '../src/models/Rol.js'
import Permiso from '../src/models/Permiso.js'
import SeguimientoRadicados from '../src/models/SeguimientoRadicados.js'
import { notificarUsuarios } from '../src/utils/sendPush.js'
import { limpiarCacheWp } from '../src/modules/sitio_web/wp.client.js'
import { avisarRadicadosNuevos } from '../src/modules/sitio_web/radicados.avisos.js'

// WordPress se simula con un fetch falso: ninguna prueba toca el sitio real.
const respuestaWp = (items) =>
  new Response(JSON.stringify({ items, total: items.length, totalPaginas: 1 }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })

const itemWp = (id, extra = {}) => ({
  id,
  radicado: `TTN-2026-${String(id).padStart(4, '0')}`,
  formulario: { id: 1, titulo: 'Portal PQRSF - Atención al Ciudadano' },
  estado: 'unread',
  fecha: '2026-10-28 09:00:00',
  resumen: { tipo: 'Queja', asunto: 'Cobro', solicitante: 'Ana', correo: 'ana@example.com' },
  ...extra,
})

async function crearGestorPqrs() {
  const permiso = await Permiso.findOneAndUpdate(
    { codigo: 'pqrs:gestionar' },
    { codigo: 'pqrs:gestionar', modulo: 'pqrs', accion: 'gestionar', nombre: 'Gestionar PQRS' },
    { upsert: true, new: true },
  )
  const sufijo = Math.random().toString(36).slice(2)
  const rol = await Rol.create({ nombre: `Rol-${sufijo}`, slug: `rol-${sufijo}`, permisos: [permiso._id] })
  return Usuario.create({
    nombre_usuario: `user-${sufijo}`,
    nombre: 'Gestor PQRS',
    password: 'hash-no-usado-en-estos-tests',
    email: `${sufijo}@example.com`,
    rol: rol._id,
    estado: 'activo',
  })
}

let fetchMock
let gestor
const envOriginal = { ...env }

beforeEach(async () => {
  vi.clearAllMocks()
  limpiarCacheWp()
  env.WP_URL = 'https://sitio.test'
  env.WP_USER = 'prensa'
  env.WP_APP_PASSWORD = 'aaaa bbbb cccc'
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  gestor = await crearGestorPqrs()
})

afterEach(() => {
  vi.unstubAllGlobals()
  Object.assign(env, envOriginal)
})

describe('avisarRadicadosNuevos', () => {
  it('la primera vez solo fija el punto de partida y no avisa del historial', async () => {
    fetchMock.mockImplementation(() => respuestaWp([itemWp(12), itemWp(11)]))

    expect(await avisarRadicadosNuevos()).toBe(0)

    expect(notificarUsuarios).not.toHaveBeenCalled()
    expect((await SeguimientoRadicados.findOne({ clave: 'global' })).ultimoId).toBe(12)
  })

  it('avisa de cada radicado nuevo a quien tiene pqrs:gestionar y no repite en la vuelta siguiente', async () => {
    await SeguimientoRadicados.create({ ultimoId: 12 })
    fetchMock.mockImplementation(() => respuestaWp([itemWp(14), itemWp(13), itemWp(12)]))

    expect(await avisarRadicadosNuevos()).toBe(2)

    expect(notificarUsuarios).toHaveBeenCalledTimes(2)
    const [destinatarios, payload, categoria] = notificarUsuarios.mock.calls[0]
    expect(destinatarios.map(String)).toContain(String(gestor._id))
    expect(categoria).toBe('pqrs')
    // Del más viejo al más nuevo.
    expect(payload.detalles).toContainEqual({ etiqueta: 'Radicado', valor: 'TTN-2026-0013' })
    expect(payload.url).toBe('/sitio-web/radicados')

    limpiarCacheWp()
    notificarUsuarios.mockClear()
    expect(await avisarRadicadosNuevos()).toBe(0)
    expect(notificarUsuarios).not.toHaveBeenCalled()
  })

  it('resume en un solo aviso cuando llegan muchos de golpe', async () => {
    await SeguimientoRadicados.create({ ultimoId: 10 })
    fetchMock.mockImplementation(() => respuestaWp([itemWp(15), itemWp(14), itemWp(13), itemWp(12), itemWp(11)]))

    expect(await avisarRadicadosNuevos()).toBe(5)

    expect(notificarUsuarios).toHaveBeenCalledTimes(1)
    expect(notificarUsuarios.mock.calls[0][1].title).toBe('5 radicados nuevos en el sitio web')
  })

  it('si WordPress falla no avanza la marca: el aviso se hace en una vuelta posterior', async () => {
    await SeguimientoRadicados.create({ ultimoId: 12 })
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 502 }))

    await expect(avisarRadicadosNuevos()).rejects.toThrow()
    expect((await SeguimientoRadicados.findOne({ clave: 'global' })).ultimoId).toBe(12)

    limpiarCacheWp()
    fetchMock.mockImplementation(() => respuestaWp([itemWp(13), itemWp(12)]))
    expect(await avisarRadicadosNuevos()).toBe(1)
  })

  it('sin conexión configurada con WordPress no hace nada', async () => {
    env.WP_URL = ''
    expect(await avisarRadicadosNuevos()).toBe(0)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
