import mongoose from 'mongoose'

const registroAuditoriaSchema = new mongoose.Schema(
  {
    usuario: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true },
    // Desnormalizado a propósito: el registro debe seguir siendo legible aun
    // si el Usuario que hizo la acción se elimina después.
    usuarioNombre: { type: String, required: true },
    rolSlug: { type: String, trim: true },
    accion: { type: String, required: true, trim: true }, // 'crear' | 'actualizar' | 'eliminar' | ...
    modulo: { type: String, required: true, trim: true },
    entidad: { type: String, trim: true },
    entidadId: { type: mongoose.Schema.Types.ObjectId },
    descripcion: { type: String, trim: true },
    cambios: {
      antes: { type: mongoose.Schema.Types.Mixed },
      despues: { type: mongoose.Schema.Types.Mixed },
    },
    ip: { type: String, trim: true },
    resultado: { type: String, enum: ['exito', 'error'], default: 'exito' },
  },
  { timestamps: { createdAt: 'creadoEn', updatedAt: false } }
)

registroAuditoriaSchema.index({ modulo: 1, creadoEn: -1 })
registroAuditoriaSchema.index({ usuario: 1, creadoEn: -1 })
// Optimiza RegistroAuditoria.countDocuments({ creadoEn: { $gte: ... } }) en
// el dashboard universal (tarjeta "auditoriaHoy") y la purga por retención
// (auditoria.worker.js): ambas filtran solo por creadoEn, sin igualdad previa
// en modulo/usuario, así que ninguno de los 2 índices compuestos de arriba
// era utilizable para esa consulta — quedaba en COLLSCAN.
registroAuditoriaSchema.index({ creadoEn: -1 })

export default mongoose.model('RegistroAuditoria', registroAuditoriaSchema)
