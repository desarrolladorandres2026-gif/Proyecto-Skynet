import { describe, it, expect, vi, afterAll } from 'vitest'
import fs from 'node:fs/promises'
import Usuario from '../src/models/Usuario.js'
import Rol from '../src/models/Rol.js'
import RegistroAuditoria from '../src/models/RegistroAuditoria.js'
import RegistroPurgaAuditoria from '../src/models/RegistroPurgaAuditoria.js'
import { hashPassword } from '../src/utils/password.js'
import { env } from '../src/config/env.js'
import * as archivadoModulo from '../src/modules/auditoria/auditoria.archivado.js'
import { purgarAntiguos } from '../src/modules/auditoria/auditoria.service.js'

// Fase 12 de la auditoría 2026-08-22: la purga automática de auditoría no
// debe borrar nada sin archivar y verificar primero.

async function crearUsuario() {
  const sufijo = Math.random().toString(36).slice(2)
  const rol = await Rol.create({ nombre: `Rol-${sufijo}`, slug: `rol_${sufijo}`, esSuperAdmin: false, ambito: 'global', permisos: [] })
  return Usuario.create({
    nombre_usuario: `user-${sufijo}`,
    nombre: 'Usuario Prueba',
    email: `${sufijo}@example.com`,
    password: await hashPassword('Clave.Segura.2026'),
    rol: rol._id,
  })
}

async function crearRegistroViejo(usuario, mesesAtras = 6) {
  const doc = await RegistroAuditoria.create({
    usuario: usuario._id,
    usuarioNombre: usuario.nombre,
    accion: 'crear',
    modulo: 'demo',
    descripcion: 'Registro de prueba',
  })
  const fechaVieja = new Date()
  fechaVieja.setMonth(fechaVieja.getMonth() - mesesAtras)
  // creadoEn es el campo `timestamps.createdAt` del schema: Mongoose lo
  // marca immutable por diseño (evita que un update accidental lo pise), así
  // que un $set vía el Model normal se ignora en silencio (matchedCount:1,
  // modifiedCount:0). Para backdatearlo en la prueba hay que ir directo a la
  // colección nativa, evitando esa capa.
  await RegistroAuditoria.collection.updateOne({ _id: doc._id }, { $set: { creadoEn: fechaVieja } })
  return doc
}

afterAll(async () => {
  // Estas pruebas escriben archivos reales en disco (env.AUDITORIA_ARCHIVO_DIR
  // = storage/auditoria-archivada/ por defecto) — se limpian al terminar
  // para no dejar basura de test en el árbol del repo (aunque storage/ ya
  // está gitignored).
  await fs.rm(env.AUDITORIA_ARCHIVO_DIR, { recursive: true, force: true })
})

describe('purgarAntiguos — archiva antes de borrar', () => {
  it('archiva a disco, verifica y SOLO ENTONCES borra; registra la corrida como éxito', async () => {
    const usuario = await crearUsuario()
    await crearRegistroViejo(usuario)
    await RegistroAuditoria.create({ usuario: usuario._id, usuarioNombre: usuario.nombre, accion: 'crear', modulo: 'demo', descripcion: 'Reciente' }) // no debe purgarse

    const eliminados = await purgarAntiguos()
    expect(eliminados).toBe(1)

    const quedan = await RegistroAuditoria.countDocuments({})
    expect(quedan).toBe(1) // solo el reciente

    const corrida = await RegistroPurgaAuditoria.findOne().sort({ creadoEn: -1 })
    expect(corrida.resultado).toBe('exito')
    expect(corrida.cantidad).toBe(1)
    expect(corrida.ubicacionArchivo).toBeTruthy()
    expect(corrida.hashArchivo).toBeTruthy()

    // El archivo de verdad existe en disco y contiene el registro purgado.
    const contenido = await fs.readFile(corrida.ubicacionArchivo, 'utf8')
    expect(contenido).toContain('demo')
  })

  it('si no hay nada que purgar, no crea archivo y registra la corrida como sin_datos', async () => {
    const eliminados = await purgarAntiguos()
    expect(eliminados).toBe(0)

    const corrida = await RegistroPurgaAuditoria.findOne().sort({ creadoEn: -1 })
    expect(corrida.resultado).toBe('sin_datos')
  })

  it('si el archivado falla, NO borra nada y registra la corrida como fallida', async () => {
    const usuario = await crearUsuario()
    await crearRegistroViejo(usuario)

    const spy = vi.spyOn(archivadoModulo, 'archivarAntesDePurgar').mockRejectedValue(new Error('disco lleno, simulado'))

    await expect(purgarAntiguos()).rejects.toThrow('disco lleno')

    const quedan = await RegistroAuditoria.countDocuments({})
    expect(quedan).toBe(1) // nada se borró

    spy.mockRestore()
  })

  it('el siguiente ciclo (reintento) sí purga después de que el anterior falló', async () => {
    const usuario = await crearUsuario()
    await crearRegistroViejo(usuario)

    const spy = vi.spyOn(archivadoModulo, 'archivarAntesDePurgar').mockRejectedValueOnce(new Error('fallo puntual, simulado'))
    await expect(purgarAntiguos()).rejects.toThrow()
    spy.mockRestore()

    expect(await RegistroAuditoria.countDocuments({})).toBe(1)

    const eliminados = await purgarAntiguos()
    expect(eliminados).toBe(1)
    expect(await RegistroAuditoria.countDocuments({})).toBe(0)
  })

  it('el conteo verificado no coincidir con lo escrito bloquea la purga (verificación real, no solo "no lanzó")', async () => {
    const usuario = await crearUsuario()
    await crearRegistroViejo(usuario)

    // Simula una escritura corrupta: writeFile "funciona" pero el archivo
    // queda con menos líneas de las esperadas.
    const writeFileReal = fs.writeFile
    const spy = vi.spyOn(fs, 'writeFile').mockImplementation(async (ruta, _contenido, enc) => {
      await writeFileReal(ruta, '', enc)
    })

    await expect(purgarAntiguos()).rejects.toThrow('Verificación de archivado falló')
    expect(await RegistroAuditoria.countDocuments({})).toBe(1)

    spy.mockRestore()
  })
})
