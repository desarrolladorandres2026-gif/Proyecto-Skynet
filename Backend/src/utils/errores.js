// Errores tipados para la capa Service: se lanzan con `throw` y llegan a
// errorHandler.js vía asyncHandler/safeRouter, que ya leen `err.status`.
export class ErrorAplicacion extends Error {
  constructor(mensaje, status = 400) {
    super(mensaje)
    this.status = status
  }
}

export class ErrorNoEncontrado extends ErrorAplicacion {
  constructor(mensaje = 'Recurso no encontrado') {
    super(mensaje, 404)
  }
}

export class ErrorConflicto extends ErrorAplicacion {
  constructor(mensaje = 'Conflicto con el estado actual del recurso') {
    super(mensaje, 409)
  }
}

export class ErrorValidacion extends ErrorAplicacion {
  constructor(mensaje = 'Datos inválidos') {
    super(mensaje, 400)
  }
}
