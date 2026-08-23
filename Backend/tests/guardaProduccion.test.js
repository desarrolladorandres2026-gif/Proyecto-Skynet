import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { guardaProduccion } from '../scripts/lib/guardaProduccion.js'

// process.exit(1) mata el proceso de verdad; se reemplaza por un espía que
// lanza (para poder cortar la ejecución del script bajo prueba igual que lo
// haría exit real) sin matar la suite de tests.
describe('guardaProduccion', () => {
  const argvOriginal = process.argv
  const envOriginal = process.env.NODE_ENV
  let exitSpy
  let errorSpy
  let warnSpy

  beforeEach(() => {
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit llamado')
    })
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    process.argv = argvOriginal
    process.env.NODE_ENV = envOriginal
    vi.restoreAllMocks()
  })

  it('no bloquea fuera de producción, sin importar los argumentos', () => {
    process.env.NODE_ENV = 'development'
    process.argv = ['node', 'script.js']
    expect(() => guardaProduccion({ script: 'x.js', operacion: 'y' })).not.toThrow()
    expect(exitSpy).not.toHaveBeenCalled()
  })

  it('bloquea en producción sin ningún flag de confirmación', () => {
    process.env.NODE_ENV = 'production'
    process.argv = ['node', 'script.js']
    expect(() => guardaProduccion({ script: 'seed.js', operacion: 'crear usuarios' })).toThrow('process.exit llamado')
    expect(exitSpy).toHaveBeenCalledWith(1)
    expect(errorSpy).toHaveBeenCalled()
  })

  it('bloquea en producción si el flag está pero el valor no es exactamente "SI-PRODUCCION"', () => {
    process.env.NODE_ENV = 'production'
    process.argv = ['node', 'script.js', '--confirmar-produccion', 'si']
    expect(() => guardaProduccion({ script: 'seed.js', operacion: 'crear usuarios' })).toThrow()
    expect(exitSpy).toHaveBeenCalledWith(1)
  })

  it('bloquea en producción si el flag está sin ningún valor después', () => {
    process.env.NODE_ENV = 'production'
    process.argv = ['node', 'script.js', '--confirmar-produccion']
    expect(() => guardaProduccion({ script: 'seed.js', operacion: 'crear usuarios' })).toThrow()
    expect(exitSpy).toHaveBeenCalledWith(1)
  })

  it('deja pasar en producción con el flag y el valor exactos', () => {
    process.env.NODE_ENV = 'production'
    process.argv = ['node', 'script.js', '--confirmar-produccion', 'SI-PRODUCCION']
    expect(() => guardaProduccion({ script: 'seed.js', operacion: 'crear usuarios' })).not.toThrow()
    expect(exitSpy).not.toHaveBeenCalled()
    expect(warnSpy).toHaveBeenCalled()
  })
})
