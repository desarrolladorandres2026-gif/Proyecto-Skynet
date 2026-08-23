import { describe, it, expect } from 'vitest'
import PasswordResetToken from '../src/models/PasswordResetToken.js'
import Usuario from '../src/models/Usuario.js'
import Rol from '../src/models/Rol.js'
import { hashPassword } from '../src/utils/password.js'

async function crearUsuario() {
  const rol = await Rol.create({ nombre: 'Rol', slug: `rol-${Date.now()}`, esSuperAdmin: false, ambito: 'global', permisos: [] })
  return Usuario.create({
    nombre_usuario: `user-${Date.now()}`,
    nombre: 'Usuario',
    email: `${Date.now()}@example.com`,
    password: await hashPassword('Clave.Segura.2026'),
    rol: rol._id,
  })
}

describe('PasswordResetToken — TTL', () => {
  it('declara un índice TTL sobre expira_en con expireAfterSeconds:0', () => {
    const indices = PasswordResetToken.schema.indexes()
    const ttl = indices.find(([campos]) => Object.keys(campos).join(',') === 'expira_en')
    expect(ttl).toBeDefined()
    const [, opciones] = ttl
    expect(opciones.expireAfterSeconds).toBe(0)
  })

  it('declara un índice sobre usuario para el updateMany de invalidación', () => {
    const indices = PasswordResetToken.schema.indexes()
    const idx = indices.find(([campos]) => Object.keys(campos).join(',') === 'usuario')
    expect(idx).toBeDefined()
  })

  it('un token con expira_en en el pasado sigue existiendo en la colección hasta que Mongo lo purga (TTL es asíncrono, no inmediato)', async () => {
    // No se espera aquí a que el barrido de TTL de Mongo corra (tarda hasta
    // ~60s en mongod real; en mongodb-memory-server puede no correr en
    // absoluto dentro de la ventana de un test) — lo que importa para el
    // flujo de la app es que la CONSULTA que usa auth.controller.js ya trata
    // este documento como inválido sin importar si Mongo lo purgó o no.
    const usuario = await crearUsuario()
    await PasswordResetToken.create({
      usuario: usuario._id,
      token: 'hash-de-un-token-ya-vencido',
      expira_en: new Date(Date.now() - 60_000),
      usado: false,
    })

    const encontrado = await PasswordResetToken.findOne({
      token: 'hash-de-un-token-ya-vencido',
      usado: false,
      expira_en: { $gt: new Date() },
    })
    expect(encontrado).toBeNull()
  })

  it('un token vigente (no vencido, no usado) sigue siendo válido para la consulta de la app', async () => {
    const usuario = await crearUsuario()
    await PasswordResetToken.create({
      usuario: usuario._id,
      token: 'hash-de-un-token-vigente',
      expira_en: new Date(Date.now() + 60 * 60 * 1000),
      usado: false,
    })

    const encontrado = await PasswordResetToken.findOne({
      token: 'hash-de-un-token-vigente',
      usado: false,
      expira_en: { $gt: new Date() },
    })
    expect(encontrado).not.toBeNull()
  })
})
