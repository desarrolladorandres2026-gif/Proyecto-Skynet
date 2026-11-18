import { describe, expect, it } from 'vitest'
import { enTemporada, resolverTematica } from './seleccion.js'

const navidad = { id: 'navidad', temporada: { desde: [11, 15], hasta: [1, 6] } }
const halloween = { id: 'halloween', temporada: { desde: [10, 15], hasta: [11, 2] } }
const registro = [navidad, halloween]
const d = (mes, dia) => new Date(2026, mes - 1, dia)

describe('enTemporada', () => {
  it('soporta temporadas que cruzan el fin de año', () => {
    expect(enTemporada(navidad, d(11, 14))).toBe(false)
    expect(enTemporada(navidad, d(11, 15))).toBe(true)
    expect(enTemporada(navidad, d(12, 31))).toBe(true)
    expect(enTemporada(navidad, d(1, 6))).toBe(true)
    expect(enTemporada(navidad, d(1, 7))).toBe(false)
  })

  it('soporta temporadas dentro del mismo año', () => {
    expect(enTemporada(halloween, d(10, 14))).toBe(false)
    expect(enTemporada(halloween, d(10, 31))).toBe(true)
    expect(enTemporada(halloween, d(11, 2))).toBe(true)
    expect(enTemporada(halloween, d(11, 3))).toBe(false)
  })

  it('una temática sin temporada nunca está en temporada', () => {
    expect(enTemporada({ id: 'x' }, d(12, 25))).toBe(false)
  })
})

describe('resolverTematica', () => {
  it('auto elige la de la temporada vigente o ninguna', () => {
    expect(resolverTematica('auto', registro, d(12, 24))?.id).toBe('navidad')
    expect(resolverTematica('auto', registro, d(10, 31))?.id).toBe('halloween')
    expect(resolverTematica('auto', registro, d(7, 10))).toBeNull()
  })

  it('ninguna apaga todo', () => {
    expect(resolverTematica('ninguna', registro, d(12, 24))).toBeNull()
  })

  it('un id elegido a mano se respeta fuera de temporada', () => {
    expect(resolverTematica('halloween', registro, d(7, 10))?.id).toBe('halloween')
  })

  it('un id desconocido cae a auto', () => {
    expect(resolverTematica('pascua', registro, d(12, 24))?.id).toBe('navidad')
    expect(resolverTematica('pascua', registro, d(7, 10))).toBeNull()
  })
})
