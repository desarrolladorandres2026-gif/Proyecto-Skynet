import { Router } from 'express'
import { asyncHandler } from './asyncHandler.js'

const METODOS = ['get', 'post', 'put', 'patch', 'delete']

// Crea un Router cuyos métodos HTTP envuelven automáticamente cada handler
// (incluidos los de middleware intermedios) en asyncHandler, para que ningún
// endpoint nuevo pueda "olvidarse" de capturar sus errores async.
export function safeRouter() {
  const router = Router()

  for (const metodo of METODOS) {
    const original = router[metodo].bind(router)
    router[metodo] = (path, ...handlers) => original(path, ...handlers.map(asyncHandler))
  }

  return router
}
