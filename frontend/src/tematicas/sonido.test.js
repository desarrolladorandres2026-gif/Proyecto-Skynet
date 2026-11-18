import { describe, expect, it } from 'vitest'
import { duracionMelodia, frecuenciaDeNota, programarMelodia } from './sonido.js'

describe('frecuenciaDeNota', () => {
  it('convierte notas a Hz (A4 = 440)', () => {
    expect(frecuenciaDeNota('A4')).toBeCloseTo(440, 5)
    expect(frecuenciaDeNota('E5')).toBeCloseTo(659.26, 1)
    expect(frecuenciaDeNota('C5')).toBeCloseTo(523.25, 1)
  })
  it('soporta sostenidos y bemoles', () => {
    expect(frecuenciaDeNota('F#4')).toBeCloseTo(369.99, 1)
    expect(frecuenciaDeNota('Bb3')).toBeCloseTo(233.08, 1)
  })
  it('silencio o nota inválida → null', () => {
    expect(frecuenciaDeNota('R')).toBeNull()
    expect(frecuenciaDeNota('H9')).toBeNull()
  })
})

describe('programarMelodia', () => {
  it('encadena las notas según tempo y duración, saltando silencios', () => {
    const ev = programarMelodia({ tempo: 120, notas: [['A4', 1], ['R', 2], ['E5', 0.5]] })
    expect(ev).toHaveLength(2)
    expect(ev[0]).toMatchObject({ inicio: 0, duracion: 0.5 })
    expect(ev[1].inicio).toBeCloseTo(1.5, 5)
    expect(ev[1].duracion).toBeCloseTo(0.25, 5)
  })
  it('sin notas no programa nada', () => {
    expect(programarMelodia({})).toEqual([])
  })
})

describe('duracionMelodia', () => {
  it('suma los tiempos (silencios incluidos) según el tempo', () => {
    expect(duracionMelodia({ tempo: 120, notas: [['A4', 1], ['R', 2], ['E5', 0.5]] })).toBeCloseTo(1.75, 5)
    expect(duracionMelodia({})).toBe(0)
  })
})
