export function notFoundHandler(_req, res) {
  res.status(404).json({ error: 'Ruta no encontrada' })
}

export function errorHandler(err, _req, res, _next) {
  console.error('Error no controlado:', err)
  const status = err.status || 500
  // Los errores 5xx no exponen err.message al cliente: podría filtrar detalles
  // internos (mensajes de Mongoose/Mongo, rutas, etc.). Los 4xx son mensajes
  // de validación intencionales y sí se devuelven.
  const mensaje = status < 500 ? err.message : 'Error interno del servidor'
  res.status(status).json({ error: mensaje })
}
