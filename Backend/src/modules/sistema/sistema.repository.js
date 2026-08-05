import ModuloSistema from '../../models/ModuloSistema.js'

// Solo Mongoose: sin reglas de negocio (mismo contrato que roles.repository).
export function listar() {
  return ModuloSistema.find().sort({ orden: 1 })
}

export function obtenerPorKey(key) {
  return ModuloSistema.findOne({ key })
}

export function listarDesactivados() {
  return ModuloSistema.find({ activo: false }).select('key')
}

export function actualizarActivo(key, activo) {
  return ModuloSistema.findOneAndUpdate({ key }, { activo }, { new: true })
}

export function eliminarNoListados(keys) {
  return ModuloSistema.deleteMany({ key: { $nin: keys } })
}

export function upsertCatalogo(modulo) {
  return ModuloSistema.updateOne(
    { key: modulo.key },
    {
      // El estado `activo` NUNCA se toca aquí: el catálogo define qué módulos
      // existen; encender/apagar es decisión del Super Admin y debe sobrevivir
      // a cada reinicio del servidor.
      $set: {
        nombre: modulo.nombre,
        descripcion: modulo.descripcion,
        esNucleo: modulo.esNucleo,
        orden: modulo.orden,
      },
      $setOnInsert: { activo: true },
    },
    { upsert: true }
  )
}
