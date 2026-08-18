import crypto from 'node:crypto'

// Los tokens de un solo uso (reset de contraseña, aprobación de conexión de
// Gmail) viajan en texto plano por email/URL — eso es inevitable, es lo que
// el usuario copia o clickea. Pero lo que se PERSISTE en Mongo es el hash: si
// la base de datos se filtrara (backup expuesto, acceso no autorizado), los
// tokens ahí guardados no sirven para nada sin también tener el original que
// solo viajó por el correo del usuario. SHA-256 (no bcrypt) porque esto no es
// una contraseña de baja entropía adivinable por fuerza bruta offline: son 32
// bytes aleatorios (2^256 posibilidades), el hash rápido no debilita nada
// aquí y evita el costo de bcrypt en cada validación de token.
export function hashToken(tokenPlano) {
  return crypto.createHash('sha256').update(tokenPlano).digest('hex')
}
