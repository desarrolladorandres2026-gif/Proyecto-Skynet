import { describe, expect, it, afterEach } from 'vitest'
import { esEscritorio, puenteEscritorio } from '../src/escritorio/esEscritorio.js'

// `esEscritorio()` decide qué motor de voz se usa (Web Speech en el navegador,
// Vosk en el asistente), así que un falso positivo rompe el panel web para
// todo el mundo: intentaría cargar 40 MB de modelo que no existe.
//
// De ahí que las pruebas insistan en los casos NEGATIVOS.

afterEach(() => {
  delete window.skynetEscritorio
})

describe('detección del modo escritorio', () => {
  it('en un navegador normal es false', () => {
    expect(esEscritorio()).toBe(false)
  })

  it('es true solo con un puente bien formado', () => {
    window.skynetEscritorio = { version: 1 }
    expect(esEscritorio()).toBe(true)
  })

  it('no se deja engañar por un objeto cualquiera', () => {
    // Se comprueba que `version` sea un NÚMERO, no que el objeto exista: una
    // extensión del navegador o un script de terceros podrían dejar algo con
    // ese nombre en window, y bastaría para desviar todo el motor de voz.
    window.skynetEscritorio = {}
    expect(esEscritorio()).toBe(false)

    window.skynetEscritorio = { version: 'escritorio' }
    expect(esEscritorio()).toBe(false)

    window.skynetEscritorio = true
    expect(esEscritorio()).toBe(false)
  })
})

describe('puente inerte en el navegador', () => {
  it('expone la misma forma para no sembrar el código de condicionales', () => {
    const puente = puenteEscritorio()
    for (const metodo of [
      'alEscuchar',
      'alCambiarWakeWord',
      'reportarEstado',
      'abrirPanel',
      'sesionCaducada',
      'diagnostico',
      'urlModelo',
    ]) {
      expect(typeof puente[metodo]).toBe('function')
    }
  })

  it('las suscripciones devuelven una función de baja', () => {
    // React llama al valor devuelto en el cleanup del efecto. Si aquí no
    // hubiera función, el desmontaje del componente reventaría en el navegador
    // y solo ahí — el caso más fácil de que se escape a producción.
    const puente = puenteEscritorio()
    expect(typeof puente.alEscuchar(() => {})).toBe('function')
    expect(typeof puente.alCambiarWakeWord(() => {})).toBe('function')
    expect(() => puente.alEscuchar(() => {})()).not.toThrow()
  })

  it('no hay modelo ni atajo fuera del escritorio', () => {
    const puente = puenteEscritorio()
    expect(puente.urlModelo()).toBeNull()
    expect(puente.atajo).toBeNull()
    expect(puente.wakeWordInicial).toBe(false)
  })

  it('los avisos al proceso principal no hacen nada en el navegador', () => {
    const puente = puenteEscritorio()
    expect(() => {
      puente.reportarEstado('SPEAKING')
      puente.abrirPanel('/dashboard')
      puente.sesionCaducada()
    }).not.toThrow()
  })

  it('devuelve el puente REAL cuando existe', () => {
    const real = { version: 1, atajo: 'Control+Shift+S' }
    window.skynetEscritorio = real
    expect(puenteEscritorio()).toBe(real)
  })
})
