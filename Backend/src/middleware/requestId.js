import crypto from 'node:crypto'

// Un id corto por petición, sin datos del usuario: sirve para correlacionar
// "lo que ve el usuario" (el requestId que devuelve un error 500) con "lo que
// queda en el log del servidor" (console.error, ver errorHandler.js), sin
// tener que loguear ni exponer nada sensible de la petición.
export function requestId(req, res, next) {
  req.id = crypto.randomUUID()
  res.setHeader('X-Request-Id', req.id)
  next()
}
