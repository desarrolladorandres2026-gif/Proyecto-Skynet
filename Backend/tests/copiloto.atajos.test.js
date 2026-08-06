import { describe, expect, it, vi } from 'vitest'
import { resolverAtajo } from '../src/modules/copiloto/copiloto.atajos.js'
import { CacheLRU } from '../src/modules/copiloto/copiloto.cache.js'

const USUARIO = { nombre_usuario: 'Ana Gómez', id_usuario: 'u1' }

// Fabrica el Map que responderStream le pasa al atajo: las herramientas YA
// filtradas por rol y por módulo activo.
function herramientas(mapa) {
  return new Map(Object.entries(mapa).map(([nombre, ejecutar]) => [nombre, { ejecutar }]))
}

describe('resolverAtajo', () => {
  it('responde la cortesía sin tocar ninguna herramienta', async () => {
    const sinHerramientas = new Map()
    const r = await resolverAtajo('hola', USUARIO, sinHerramientas)
    expect(r.intencion).toBe('saludo')
    expect(r.texto).toMatch(/Ana|Aquí estoy|qué/i)
  })

  it('ejecuta la herramienta y redacta en español natural', async () => {
    const ejecutar = vi.fn().mockResolvedValue([
      { estado: 'pendiente_financiero', tipo: 'compra' },
      { estado: 'pendiente_bodega', tipo: 'compra' },
    ])
    const r = await resolverAtajo('cómo van mis requerimientos', USUARIO, herramientas({ mis_requerimientos: ejecutar }))
    expect(ejecutar).toHaveBeenCalledOnce()
    expect(r.texto).toBe(
      'Tienes 2 requerimientos en total: 1 esperando aprobación de Financiero y 1 en Bodega.'
    )
  })

  it('trata el caso vacío como buena noticia, no como error', async () => {
    const r = await resolverAtajo('qué tengo pendiente', USUARIO, herramientas({ resumen_dashboard: async () => ({}) }))
    expect(r.texto).toBe('No tienes nada pendiente por ahora. Todo al día.')
  })

  it('pasa el estado detectado como argumento a la herramienta', async () => {
    const ejecutar = vi.fn().mockResolvedValue([])
    await resolverAtajo('mis vacaciones aprobadas', USUARIO, herramientas({ mis_ausencias: ejecutar }))
    expect(ejecutar).toHaveBeenCalledWith({ estado: 'aprobada' })
  })

  // ── Los tres casos en los que DEBE ceder el paso al modelo ────────────────

  it('cede al modelo cuando la herramienta no está disponible para el rol', async () => {
    // Map vacío = módulo apagado o rol sin acceso. El atajo no puede inventar
    // una respuesta: devuelve null y el modelo explica que está fuera de su
    // alcance, igual que si la pregunta hubiera entrado por el camino normal.
    expect(await resolverAtajo('mis vacaciones', USUARIO, new Map())).toBeNull()
  })

  it('cede al modelo si la consulta falla, en vez de mostrar un error propio', async () => {
    const rota = herramientas({
      mis_requerimientos: async () => {
        throw new Error('Mongo no responde')
      },
    })
    expect(await resolverAtajo('mis requerimientos', USUARIO, rota)).toBeNull()
  })

  it('cede al modelo si la herramienta devuelve una forma inesperada', async () => {
    const rara = herramientas({ mis_requerimientos: async () => ({ algo: 'distinto' }) })
    expect(await resolverAtajo('mis requerimientos', USUARIO, rara)).toBeNull()
  })
})

describe('CacheLRU', () => {
  it('devuelve lo guardado y cuenta aciertos', () => {
    const c = new CacheLRU({ maximo: 3, ttlMs: 1000 })
    c.guardar('a', 1)
    expect(c.obtener('a')).toBe(1)
    expect(c.metricas.aciertos).toBe(1)
  })

  it('vence las entradas por TTL', () => {
    vi.useFakeTimers()
    const c = new CacheLRU({ maximo: 3, ttlMs: 1000 })
    c.guardar('a', 1)
    vi.advanceTimersByTime(1001)
    expect(c.obtener('a')).toBeUndefined()
    vi.useRealTimers()
  })

  it('desaloja la MENOS usada recientemente, no la más vieja', () => {
    const c = new CacheLRU({ maximo: 2, ttlMs: 10_000 })
    c.guardar('a', 1)
    c.guardar('b', 2)
    c.obtener('a') // 'a' pasa a ser la más reciente; 'b' queda como candidata
    c.guardar('c', 3)
    expect(c.obtener('a')).toBe(1)
    expect(c.obtener('b')).toBeUndefined()
  })

  it('comparte una sola ejecución entre llamadas simultáneas', async () => {
    // Es el caso real de pulsar el micrófono dos veces seguidas: sin cachear
    // la PROMESA (y no el resultado), las dos consultas salen a Mongo.
    const c = new CacheLRU({ maximo: 5, ttlMs: 1000 })
    const fn = vi.fn().mockResolvedValue('dato')
    const [x, y] = await Promise.all([c.through('k', fn), c.through('k', fn)])
    expect(fn).toHaveBeenCalledOnce()
    expect([x, y]).toEqual(['dato', 'dato'])
  })

  it('no cachea los fallos: el siguiente intento vuelve a ejecutar', async () => {
    const c = new CacheLRU({ maximo: 5, ttlMs: 1000 })
    const fn = vi.fn().mockRejectedValueOnce(new Error('caída')).mockResolvedValue('ok')
    await expect(c.through('k', fn)).rejects.toThrow('caída')
    await expect(c.through('k', fn)).resolves.toBe('ok')
    expect(fn).toHaveBeenCalledTimes(2)
  })
})
