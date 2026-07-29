import bcrypt from 'bcryptjs'

// Coste de bcrypt. 12 rounds es el mínimo recomendado hoy por OWASP; sube el
// tiempo de verificación (~200 ms con bcryptjs) lo suficiente para encarecer la
// fuerza bruta sin degradar la experiencia de un login legítimo.
export const BCRYPT_ROUNDS = 12

// Longitud mínima de contraseña. La longitud es el factor de fortaleza más
// eficaz frente a complejidad forzada de caracteres.
export const PASSWORD_MIN = 12

// bcrypt solo usa los primeros 72 bytes de la contraseña. Rechazar longitudes
// mayores evita una falsa sensación de fortaleza (los caracteres extra se
// ignoran en silencio y dos contraseñas distintas podrían validar igual).
const PASSWORD_MAX_BYTES = 72

// Hash señuelo precomputado al arrancar. Se compara contra él cuando el email
// no existe, de modo que el login tarde lo mismo exista o no el usuario y no se
// pueda enumerar cuentas válidas midiendo el tiempo de respuesta.
export const DUMMY_HASH = bcrypt.hashSync('placeholder-usuario-inexistente', BCRYPT_ROUNDS)

export function hashPassword(plain) {
  return bcrypt.hash(plain, BCRYPT_ROUNDS)
}

// Devuelve un mensaje de error si la contraseña no cumple la política, o null si
// es válida. Valida el TIPO primero: bloquea objetos ({$ne:...}), arrays, etc.
export function validarPassword(password) {
  if (typeof password !== 'string') return 'La contraseña es obligatoria'
  if (password.length < PASSWORD_MIN) {
    return `La contraseña debe tener al menos ${PASSWORD_MIN} caracteres`
  }
  if (Buffer.byteLength(password, 'utf8') > PASSWORD_MAX_BYTES) {
    return 'La contraseña no puede superar los 72 bytes'
  }
  return null
}
