import { describe, it, expect } from 'vitest'
import mongoose from 'mongoose'
import RegistroAuditoria from '../src/models/RegistroAuditoria.js'
import ConfiguracionTematica from '../src/models/ConfiguracionTematica.js'
import { obtenerModo, cambiarModo, validarModo } from '../src/modules/tematica/tematica.service.js'

const ACTOR = { id_usuario: new mongoose.Types.ObjectId(), nombre_usuario: 'admin.pruebas' }

describe('temática global', () => {
  it('sin configuración guardada el modo es "auto"', async () => {
    expect(await obtenerModo()).toBe('auto')
  })

  it('guarda el modo, lo devuelve y deja un solo documento', async () => {
    expect(await cambiarModo({ modo: 'navidad' }, ACTOR)).toBe('navidad')
    expect(await obtenerModo()).toBe('navidad')

    await cambiarModo({ modo: 'ninguna' }, ACTOR)
    expect(await obtenerModo()).toBe('ninguna')
    expect(await ConfiguracionTematica.countDocuments()).toBe(1)
  })

  it('audita el cambio con el valor anterior y el nuevo', async () => {
    await cambiarModo({ modo: 'navidad' }, ACTOR)
    const reg = await RegistroAuditoria.findOne({ modulo: 'tematica' }).lean()
    expect(reg.cambios).toEqual({ antes: { modo: 'auto' }, despues: { modo: 'navidad' } })
    expect(reg.usuarioNombre).toBe('admin.pruebas')
  })

  it('rechaza valores inválidos', () => {
    expect(() => validarModo({})).toThrow()
    expect(() => validarModo({ modo: '' })).toThrow()
    expect(() => validarModo({ modo: 'Navidad 2026' })).toThrow()
    expect(() => validarModo({ modo: 'a'.repeat(41) })).toThrow()
    expect(() => validarModo({ modo: 7 })).toThrow()
    expect(validarModo({ modo: 'san-pedro' })).toBe('san-pedro')
  })
})
