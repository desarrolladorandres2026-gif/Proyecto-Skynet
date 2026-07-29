// Express 4 no reenvía rejects de handlers async a next(err) automáticamente
// (eso solo llega en Express 5). Sin este wrapper, cualquier error async
// (ej. CastError de Mongoose por un id inválido) deja el request colgado
// hasta el timeout del cliente, sin log ni respuesta.
export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next)
  }
}
