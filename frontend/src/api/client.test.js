import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { request } from './client.js'

// Regresión de BUG-013 (auditoría 2026-08-13). `fetch` no tiene timeout
// propio: sin uno, un backend colgado (o un proxy que se queda pensando) deja
// la petición pendiente para siempre — el botón queda en spinner infinito,
// sin error que mostrar y sin forma de reintentar sin recargar la pestaña.

function respuestaOk(body = {}) {
  return { ok: true, status: 200, json: async () => body }
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('request() — timeout', () => {
  it('cancela la petición si el backend nunca responde, con un mensaje legible', async () => {
    // Un fetch que jamás resuelve simula un backend colgado.
    vi.spyOn(global, 'fetch').mockImplementation(
      (_url, { signal } = {}) =>
        new Promise((_resolve, reject) => {
          signal?.addEventListener('abort', () => {
            const err = new Error('The operation was aborted')
            err.name = 'AbortError'
            reject(err)
          })
        })
    )

    const promesa = request('/algo-lento')
    const aserto = expect(promesa).rejects.toThrow(/tardó demasiado/)

    // Avanza el reloj falso más allá del timeout por defecto (20s).
    await vi.advanceTimersByTimeAsync(21_000)
    await aserto
  })

  it('da más margen a una subida de archivo (FormData) que a una petición normal', async () => {
    let signalCapturado
    vi.spyOn(global, 'fetch').mockImplementation((_url, { signal } = {}) => {
      signalCapturado = signal
      return new Promise(() => {}) // nunca resuelve; solo interesa el signal
    })

    const formData = new FormData()
    formData.append('archivo', new File(['contenido'], 'x.txt'))

    request('/subir', { method: 'POST', body: formData }).catch(() => {})
    await vi.advanceTimersByTimeAsync(0)

    // A los 20s (timeout normal) todavía NO debe estar abortado.
    await vi.advanceTimersByTimeAsync(20_000)
    expect(signalCapturado.aborted).toBe(false)

    // A los 60s (timeout de archivo) sí.
    await vi.advanceTimersByTimeAsync(40_000)
    expect(signalCapturado.aborted).toBe(true)
  })

  it('no dispara el mensaje de timeout cuando quien llama cancela la petición a propósito', async () => {
    vi.spyOn(global, 'fetch').mockImplementation(
      (_url, { signal } = {}) =>
        new Promise((_resolve, reject) => {
          signal?.addEventListener('abort', () => {
            const err = new Error('The operation was aborted')
            err.name = 'AbortError'
            reject(err)
          })
        })
    )

    const controlador = new AbortController()
    const promesa = request('/cancelable', { signal: controlador.signal })
    controlador.abort()

    // AbortError "puro" (no el mensaje traducido de timeout): el llamador
    // sabe que canceló él mismo y no debe verlo como un fallo de red.
    await expect(promesa).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('una petición normal que responde a tiempo no se ve afectada', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(respuestaOk({ ok: true }))
    const resultado = await request('/rapido')
    expect(resultado).toEqual({ ok: true })
  })
})
