// Cifrado/descifrado simétrico del dump de backup (AES-256-GCM), compartido
// entre respaldar.js y restaurar.js. Ver auditoría de producción 2026-08-22,
// Fase 13.
//
// Formato de archivo: [16 bytes IV][16 bytes authTag][ciphertext].
import fs from 'node:fs/promises'
import fssync from 'node:fs'
import crypto from 'node:crypto'
import { pipeline } from 'node:stream/promises'

export const ALGORITMO = 'aes-256-gcm'

function claveDesdeHex(claveHex) {
  const clave = Buffer.from(claveHex, 'hex')
  if (clave.length !== 32) {
    throw new Error('La clave de cifrado debe ser hex de 32 bytes (64 caracteres) — genera con: openssl rand -hex 32')
  }
  return clave
}

export async function cifrarArchivo(rutaOrigen, rutaDestino, claveHex) {
  const clave = claveDesdeHex(claveHex)
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv(ALGORITMO, clave, iv)

  const salidaInicial = fssync.createWriteStream(rutaDestino)
  await new Promise((resolve, reject) => {
    salidaInicial.end(Buffer.concat([iv, Buffer.alloc(16)]), (err) => (err ? reject(err) : resolve()))
  })

  const entrada = fssync.createReadStream(rutaOrigen)
  const salida = fssync.createWriteStream(rutaDestino, { flags: 'r+', start: iv.length + 16 })
  await pipeline(entrada, cipher, salida)

  const authTag = cipher.getAuthTag()
  const fd = await fs.open(rutaDestino, 'r+')
  try {
    await fd.write(authTag, 0, authTag.length, iv.length)
  } finally {
    await fd.close()
  }
}

export async function descifrarArchivo(rutaCifrada, rutaDestino, claveHex) {
  const clave = claveDesdeHex(claveHex)
  const cabecera = Buffer.alloc(32)
  const fd = await fs.open(rutaCifrada, 'r')
  await fd.read(cabecera, 0, 32, 0)
  await fd.close()
  const iv = cabecera.subarray(0, 16)
  const authTag = cabecera.subarray(16, 32)

  const decipher = crypto.createDecipheriv(ALGORITMO, clave, iv)
  decipher.setAuthTag(authTag)

  const entrada = fssync.createReadStream(rutaCifrada, { start: 32 })
  const salida = fssync.createWriteStream(rutaDestino)
  await pipeline(entrada, decipher, salida)
}

export async function calcularHashSha256(ruta) {
  const hash = crypto.createHash('sha256')
  for await (const chunk of fssync.createReadStream(ruta)) hash.update(chunk)
  return hash.digest('hex')
}
