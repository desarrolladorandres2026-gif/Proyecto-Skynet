import { describe, expect, it, beforeEach } from 'vitest'
import {
  registrarPendiente,
  consumirPendiente,
  _vaciarPendientes,
} from '../src/modules/copiloto/copiloto.confirmaciones.js'

// Este archivo es la barrera entre "el modelo pidió borrar algo" y "algo se
// borró". Sus invariantes no son de comodidad: cada una tapa una forma
// concreta de ejecutar una acción destructiva sin que el usuario la aprobara.

const ana = { id_usuario: 'usuario-ana' }
const beto = { id_usuario: 'usuario-beto' }

beforeEach(() => {
  _vaciarPendientes()
})

describe('ciclo normal', () => {
  it('canjea el token por la acción que se guardó', () => {
    const token = registrarPendiente(ana, { nombre: 'eliminar_algo', args: { id: 7 } })
    expect(consumirPendiente(token, ana)).toMatchObject({
      nombre: 'eliminar_algo',
      args: { id: 7 },
    })
  })

  it('el token es opaco: no codifica la acción', () => {
    // Si el token llevara dentro qué ejecutar, alterarlo cambiaría la acción.
    // Al ser aleatorio puro, todo lo ejecutable vive en el servidor.
    const token = registrarPendiente(ana, { nombre: 'eliminar_usuario', args: { id: 'victima' } })
    expect(token).toMatch(/^[0-9a-f]{64}$/)
    expect(token).not.toContain('eliminar')
    expect(token).not.toContain('victima')
  })

  it('dos acciones seguidas generan tokens distintos', () => {
    const a = registrarPendiente(ana, { nombre: 'x', args: {} })
    const b = registrarPendiente(ana, { nombre: 'x', args: {} })
    expect(a).not.toBe(b)
  })
})

describe('un token vale UNA sola vez', () => {
  it('el segundo canje devuelve null', () => {
    // Cubre el doble clic y el reintento del navegador: sin esto, una
    // eliminación podría ejecutarse dos veces.
    const token = registrarPendiente(ana, { nombre: 'eliminar_algo', args: {} })
    expect(consumirPendiente(token, ana)).not.toBeNull()
    expect(consumirPendiente(token, ana)).toBeNull()
  })
})

describe('propiedad del token', () => {
  it('otro usuario no puede canjear un token ajeno', () => {
    // Es el caso que convierte un token filtrado (en un log, en una captura)
    // en una acción destructiva sobre datos de otro.
    const token = registrarPendiente(ana, { nombre: 'eliminar_algo', args: {} })
    expect(consumirPendiente(token, beto)).toBeNull()
  })

  it('un canje ajeno fallido NO invalida el token del dueño', () => {
    // Si el intento ajeno consumiera la entrada, cualquiera podría anular las
    // confirmaciones de los demás a base de tokens adivinados.
    const token = registrarPendiente(ana, { nombre: 'eliminar_algo', args: {} })
    expect(consumirPendiente(token, beto)).toBeNull()
    expect(consumirPendiente(token, ana)).not.toBeNull()
  })
})

describe('tokens inválidos', () => {
  const invalidos = ['', null, undefined, 'inventado', '0'.repeat(64), 123, {}]

  for (const token of invalidos) {
    it(`rechaza ${JSON.stringify(token)}`, () => {
      expect(consumirPendiente(token, ana)).toBeNull()
    })
  }
})
