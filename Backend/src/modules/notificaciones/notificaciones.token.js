import jwt from 'jsonwebtoken'
import { env } from '../../config/env.js'

// Token de un solo propósito para el enlace de baja de un correo (clic desde
// el cliente de correo, sin sesión iniciada). Reutiliza JWT_SECRET pero con
// `aud` propio para que nunca se confunda con un token de sesión aunque
// alguien intente reenviarlo a una ruta protegida por verificarToken.
const AUDIENCIA = 'notificaciones:baja-email'

export function firmarTokenBaja(usuarioId) {
  return jwt.sign({ usuarioId: String(usuarioId) }, env.JWT_SECRET, {
    audience: AUDIENCIA,
    expiresIn: '180d',
  })
}

export function verificarTokenBaja(token) {
  const payload = jwt.verify(token, env.JWT_SECRET, { audience: AUDIENCIA, algorithms: ['HS256'] })
  return payload.usuarioId
}
