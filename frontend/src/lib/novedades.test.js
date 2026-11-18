import { describe, it, expect, beforeEach } from 'vitest'
import { esNovedadVigente, guardarVistas, hoyISO, leerVistas, rutaCoincide } from './novedades.js'

beforeEach(() => localStorage.clear())

describe('hoyISO', () => {
  it('usa la fecha local, no UTC (a las 11 pm en Colombia sigue siendo el mismo día)', () => {
    expect(hoyISO(new Date(2026, 10, 18, 23, 30))).toBe('2026-11-18')
  })

  it('rellena mes y día con cero', () => {
    expect(hoyISO(new Date(2026, 0, 5))).toBe('2026-01-05')
  })
})

describe('esNovedadVigente', () => {
  const item = { to: '/x', nuevoHasta: '2026-12-18' }

  it('es novedad hasta la fecha límite inclusive', () => {
    expect(esNovedadVigente(item, '2026-11-18')).toBe(true)
    expect(esNovedadVigente(item, '2026-12-18')).toBe(true)
  })

  it('deja de serlo al día siguiente', () => {
    expect(esNovedadVigente(item, '2026-12-19')).toBe(false)
  })

  it('un item sin nuevoHasta (o inexistente) nunca es novedad', () => {
    expect(esNovedadVigente({ to: '/x' }, '2026-11-18')).toBe(false)
    expect(esNovedadVigente(undefined, '2026-11-18')).toBe(false)
  })
})

describe('rutaCoincide', () => {
  it('acepta la ruta exacta y sus subrutas', () => {
    const item = { to: '/sitio-web/radicados' }
    expect(rutaCoincide('/sitio-web/radicados', item)).toBe(true)
    expect(rutaCoincide('/sitio-web/radicados/12', item)).toBe(true)
  })

  it('no confunde prefijos parecidos', () => {
    expect(rutaCoincide('/sitio-web/radicados-viejos', { to: '/sitio-web/radicados' })).toBe(false)
  })

  it('con `end` exige la ruta exacta (Resumen no se marca al visitar Noticias)', () => {
    const resumen = { to: '/sitio-web', end: true }
    expect(rutaCoincide('/sitio-web', resumen)).toBe(true)
    expect(rutaCoincide('/sitio-web/noticias', resumen)).toBe(false)
  })
})

describe('leerVistas / guardarVistas', () => {
  it('ida y vuelta, separado por usuario', () => {
    guardarVistas(7, new Set(['/a', '/b']))
    expect([...leerVistas(7)].sort()).toEqual(['/a', '/b'])
    expect(leerVistas(8).size).toBe(0)
  })

  it('JSON corrupto o de otro tipo se trata como "nada visto"', () => {
    localStorage.setItem('skynet-novedades-vistas-7', '{no es json')
    expect(leerVistas(7).size).toBe(0)
    localStorage.setItem('skynet-novedades-vistas-7', '{"a":1}')
    expect(leerVistas(7).size).toBe(0)
  })

  it('sin usuario no lee ni escribe', () => {
    guardarVistas(undefined, new Set(['/a']))
    expect(localStorage.length).toBe(0)
    expect(leerVistas(undefined).size).toBe(0)
  })
})
