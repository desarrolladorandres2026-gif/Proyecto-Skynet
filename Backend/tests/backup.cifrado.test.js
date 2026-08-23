import { describe, it, expect, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { cifrarArchivo, descifrarArchivo, calcularHashSha256 } from '../scripts/backup/cifrado.js'

// Fase 13 de la auditoría 2026-08-22: la parte de scripts/backup/ que se
// puede probar sin mongodump/mongorestore instalados (herramientas externas
// que no vienen con Node) es el cifrado/descifrado y el hash — exactamente
// lo que protege la confidencialidad e integridad del backup. Se prueba a
// fondo aquí.

const archivos = []
afterEach(async () => {
  for (const ruta of archivos.splice(0)) await fs.rm(ruta, { force: true })
})

async function rutaTemp(nombre) {
  const ruta = path.join(os.tmpdir(), `skynet-backup-test-${Date.now()}-${Math.random().toString(36).slice(2)}-${nombre}`)
  archivos.push(ruta)
  return ruta
}

describe('cifrado de backup — ida y vuelta', () => {
  const claveValida = crypto.randomBytes(32).toString('hex')

  it('cifra y descifra un archivo pequeño, devolviendo el contenido original exacto', async () => {
    const original = await rutaTemp('original.txt')
    const contenido = 'contenido de prueba del dump — con acentos y símbolos: áéíóú, {}, []'
    await fs.writeFile(original, contenido, 'utf8')

    const cifrado = await rutaTemp('cifrado.enc')
    await cifrarArchivo(original, cifrado, claveValida)

    const descifrado = await rutaTemp('descifrado.txt')
    await descifrarArchivo(cifrado, descifrado, claveValida)

    const resultado = await fs.readFile(descifrado, 'utf8')
    expect(resultado).toBe(contenido)
  })

  it('cifra y descifra un archivo binario grande (varios MB) preservando bytes exactos', async () => {
    const original = await rutaTemp('grande.bin')
    const buffer = crypto.randomBytes(5 * 1024 * 1024) // 5 MB de datos aleatorios
    await fs.writeFile(original, buffer)

    const cifrado = await rutaTemp('grande.enc')
    await cifrarArchivo(original, cifrado, claveValida)

    const descifrado = await rutaTemp('grande.dec')
    await descifrarArchivo(cifrado, descifrado, claveValida)

    const resultado = await fs.readFile(descifrado)
    expect(resultado.equals(buffer)).toBe(true)
  })

  it('el archivo cifrado NO contiene el texto original en claro', async () => {
    const original = await rutaTemp('secreto.txt')
    const secreto = 'MONGO_URI=mongodb+srv://usuario_real:password_real@cluster.mongodb.net/Skynet'
    await fs.writeFile(original, secreto, 'utf8')

    const cifrado = await rutaTemp('secreto.enc')
    await cifrarArchivo(original, cifrado, claveValida)

    const contenidoCifrado = await fs.readFile(cifrado, 'utf8').catch(() => fs.readFile(cifrado, 'latin1'))
    expect(contenidoCifrado).not.toContain('password_real')
    expect(contenidoCifrado).not.toContain('mongodb+srv')
  })

  it('descifrar con la clave incorrecta falla (no produce datos corruptos silenciosamente)', async () => {
    const original = await rutaTemp('a.txt')
    await fs.writeFile(original, 'contenido')
    const cifrado = await rutaTemp('a.enc')
    await cifrarArchivo(original, cifrado, claveValida)

    const otraClave = crypto.randomBytes(32).toString('hex')
    const destino = await rutaTemp('a.dec')
    await expect(descifrarArchivo(cifrado, destino, otraClave)).rejects.toThrow()
  })

  it('un archivo cifrado alterado (tampering) falla la verificación de authTag al descifrar', async () => {
    const original = await rutaTemp('b.txt')
    await fs.writeFile(original, 'contenido importante que no debe alterarse')
    const cifrado = await rutaTemp('b.enc')
    await cifrarArchivo(original, cifrado, claveValida)

    // Altera un byte del ciphertext (después de los 32 bytes de cabecera).
    const buffer = await fs.readFile(cifrado)
    buffer[40] = buffer[40] ^ 0xff
    await fs.writeFile(cifrado, buffer)

    const destino = await rutaTemp('b.dec')
    await expect(descifrarArchivo(cifrado, destino, claveValida)).rejects.toThrow()
  })

  it('rechaza una clave que no tiene 32 bytes (64 hex)', async () => {
    const original = await rutaTemp('c.txt')
    await fs.writeFile(original, 'x')
    const cifrado = await rutaTemp('c.enc')
    await expect(cifrarArchivo(original, cifrado, 'clave-demasiado-corta')).rejects.toThrow(/32 bytes/)
  })

  it('calcularHashSha256 es determinístico y detecta cualquier cambio', async () => {
    const ruta = await rutaTemp('d.txt')
    await fs.writeFile(ruta, 'contenido estable')
    const hash1 = await calcularHashSha256(ruta)
    const hash2 = await calcularHashSha256(ruta)
    expect(hash1).toBe(hash2)
    expect(hash1).toMatch(/^[0-9a-f]{64}$/)

    await fs.writeFile(ruta, 'contenido cambiado')
    const hash3 = await calcularHashSha256(ruta)
    expect(hash3).not.toBe(hash1)
  })
})
