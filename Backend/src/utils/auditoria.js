import RegistroAuditoria from '../models/RegistroAuditoria.js'

// Llamada explícita desde el Service layer tras cada mutación relevante (no
// un hook pre('save') de Mongoose): un hook de schema no tiene acceso natural
// a "quién" hizo la petición, y quedaría implícito y difícil de testear.
// Si el insert de auditoría falla, se loguea pero NO se revierte ni se hace
// fallar la operación de negocio principal que la originó.
export async function registrarAuditoria({
  usuario,
  accion,
  modulo,
  entidad,
  entidadId,
  descripcion,
  cambios,
  ip,
  resultado = 'exito',
}) {
  try {
    await RegistroAuditoria.create({
      usuario: usuario.id_usuario,
      usuarioNombre: usuario.nombre_usuario,
      rolSlug: usuario.rol?.slug,
      accion,
      modulo,
      entidad,
      entidadId,
      descripcion,
      cambios,
      ip,
      resultado,
    })
  } catch (err) {
    console.error('No se pudo registrar la auditoría:', err.message)
  }
}
