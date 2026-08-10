import crypto from 'node:crypto'
import { env } from '../config/env.js'

// AES-256-GCM reversible: a diferencia de bcrypt (utils/password.js, one-way,
// para contraseñas) esto existe porque el refresh token OAuth de un
// proveedor de correo se necesita de vuelta en texto plano para pedir un
// access token nuevo — no basta con verificar que "coincide" como con una
// contraseña. TOKEN_ENCRYPTION_KEY debe ser 32 bytes en hex (openssl rand
// -hex 32); sin ella, cifrar/descifrar falla con un error claro en vez de
// arrancar el servidor con una clave débil implícita.
const ALGORITMO = 'aes-256-gcm'

function claveBuffer() {
  const hex = env.TOKEN_ENCRYPTION_KEY
  if (!hex || hex.length !== 64) {
    throw new Error(
      'TOKEN_ENCRYPTION_KEY no está configurada o no tiene 32 bytes en hex (genera una con: openssl rand -hex 32)'
    )
  }
  return Buffer.from(hex, 'hex')
}

// Devuelve un solo string "iv:authTag:cifrado" (todo en hex) para guardar en
// un único campo del documento.
export function cifrar(textoPlano) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv(ALGORITMO, claveBuffer(), iv)
  const cifrado = Buffer.concat([cipher.update(textoPlano, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${cifrado.toString('hex')}`
}

export function descifrar(valorCifrado) {
  const [ivHex, authTagHex, cifradoHex] = valorCifrado.split(':')
  const decipher = crypto.createDecipheriv(ALGORITMO, claveBuffer(), Buffer.from(ivHex, 'hex'))
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'))
  return Buffer.concat([decipher.update(Buffer.from(cifradoHex, 'hex')), decipher.final()]).toString('utf8')
}
