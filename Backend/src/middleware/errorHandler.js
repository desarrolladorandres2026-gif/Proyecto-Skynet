export function notFoundHandler(_req, res) {
  res.status(404).json({ error: 'Ruta no encontrada' })
}

// Traduce un choque contra un índice único de Mongo (E11000) al mismo 409 que
// producen los checks explícitos ("El nombre de usuario ya existe"), en vez
// del 500 genérico que devolvía antes.
//
// El check previo (`Usuario.findOne(...)` antes de `Usuario.create(...)`) no
// cierra la ventana: dos peticiones simultáneas con el mismo nombre_usuario o
// email pueden pasar la lectura las dos antes de que cualquiera escriba —
// clásico TOCTOU. El índice único en el esquema (ver models/Usuario.js) sí es
// atómico y es la única garantía real; esto solo traduce su error a algo que
// el frontend ya sabe interpretar. Ver BUG-010 en la auditoría 2026-08-13.
function mensajeDuplicado(err) {
  const campo = Object.keys(err.keyPattern || err.keyValue || {})[0]
  if (campo === 'nombre_usuario') return 'El nombre de usuario ya existe'
  if (campo === 'email') return 'El email ya está registrado'
  return `El valor de "${campo || 'un campo único'}" ya está en uso`
}

export function errorHandler(err, req, res, _next) {
  // req.id (ver middleware/requestId.js) permite correlacionar este log con
  // el error genérico que ve el usuario, sin exponerle detalles internos.
  console.error(`Error no controlado [${req.id || 'sin-id'}]:`, err)

  if (err.code === 11000) {
    return res.status(409).json({ error: mensajeDuplicado(err) })
  }

  const status = err.status || 500
  // Los errores 5xx no exponen err.message al cliente: podría filtrar detalles
  // internos (mensajes de Mongoose/Mongo, rutas, etc.). Los 4xx son mensajes
  // de validación intencionales y sí se devuelven.
  const mensaje = status < 500 ? err.message : 'Error interno del servidor'
  const body = { error: mensaje }
  if (status >= 500 && req.id) body.requestId = req.id
  res.status(status).json(body)
}
