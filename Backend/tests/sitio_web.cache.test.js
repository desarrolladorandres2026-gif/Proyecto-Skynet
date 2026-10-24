import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { env } from '../src/config/env.js'
import { wpRequest, fijarTtlCacheWp } from '../src/modules/sitio_web/wp.client.js'

// Caché de lecturas hacia WordPress: cada petición cuesta ~0,6 s, así que una
// misma lectura repetida no debe volver a salir mientras siga vigente.
const respuesta = (cuerpo) => new Response(JSON.stringify(cuerpo), { status: 200, headers: { 'content-type': 'application/json' } })

let fetchMock
const envOriginal = { ...env }

beforeEach(() => {
  env.WP_URL = 'https://sitio.test'
  env.WP_USER = 'prensa'
  env.WP_APP_PASSWORD = 'aaaa bbbb cccc'
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  fijarTtlCacheWp(20_000)
})

afterEach(() => {
  fijarTtlCacheWp(0)
  vi.unstubAllGlobals()
  Object.assign(env, envOriginal)
})

describe('caché de lecturas de WordPress', () => {
  it('la segunda lectura igual sale de memoria y no toca WordPress', async () => {
    fetchMock.mockImplementation(async () => respuesta([{ id: 1 }]))
    const a = await wpRequest('GET', '/wp/v2/posts', { query: { per_page: 5 } })
    const b = await wpRequest('GET', '/wp/v2/posts', { query: { per_page: 5 } })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(b.data).toEqual(a.data)
  })

  it('una consulta distinta sí viaja', async () => {
    fetchMock.mockImplementation(async () => respuesta([]))
    await wpRequest('GET', '/wp/v2/posts', { query: { per_page: 5 } })
    await wpRequest('GET', '/wp/v2/posts', { query: { per_page: 6 } })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('dos lecturas simultáneas comparten una sola petición', async () => {
    fetchMock.mockImplementation(async () => respuesta([{ id: 1 }]))
    await Promise.all([wpRequest('GET', '/wp/v2/media'), wpRequest('GET', '/wp/v2/media')])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('cualquier escritura vacía la caché para no mostrar datos viejos', async () => {
    fetchMock.mockImplementation(async () => respuesta({ ok: true }))
    await wpRequest('GET', '/wp/v2/posts')
    await wpRequest('POST', '/wp/v2/posts/9', { body: { title: 'x' } })
    await wpRequest('GET', '/wp/v2/posts')
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('el resultado devuelto se puede modificar sin contaminar la caché', async () => {
    fetchMock.mockImplementation(async () => respuesta([{ id: 1 }]))
    const a = await wpRequest('GET', '/wp/v2/posts')
    a.data.push({ id: 99 })
    const b = await wpRequest('GET', '/wp/v2/posts')
    expect(b.data).toEqual([{ id: 1 }])
  })

  it('una lectura que empezó antes de una escritura no deja datos viejos guardados', async () => {
    let soltar
    fetchMock.mockImplementationOnce(() => new Promise((resolver) => { soltar = () => resolver(respuesta(['viejo'])) }))
    const lectura = wpRequest('GET', '/wp/v2/posts')
    fetchMock.mockImplementationOnce(async () => respuesta({ ok: true }))
    await wpRequest('POST', '/wp/v2/posts/9', { body: {} })
    soltar()
    await lectura
    fetchMock.mockImplementationOnce(async () => respuesta(['nuevo']))
    const despues = await wpRequest('GET', '/wp/v2/posts')
    expect(despues.data).toEqual(['nuevo'])
  })

  it('un error no se guarda: el siguiente intento vuelve a pedir', async () => {
    fetchMock.mockImplementationOnce(async () => new Response('{}', { status: 500 }))
    await expect(wpRequest('GET', '/wp/v2/posts')).rejects.toThrow()
    fetchMock.mockImplementationOnce(async () => respuesta([{ id: 1 }]))
    const r = await wpRequest('GET', '/wp/v2/posts')
    expect(r.data).toEqual([{ id: 1 }])
  })
})
