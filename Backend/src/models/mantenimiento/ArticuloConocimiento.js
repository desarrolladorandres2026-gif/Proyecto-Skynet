import mongoose from 'mongoose'

// Base de Conocimiento (CMMS Fase 3.1): nace de una OT cerrada, reutilizable
// por cualquier técnico ante un problema similar. `usosCount` es la
// "frecuencia" del artículo — no se llena a mano, la incrementa vincular().
const evidenciaArticuloSchema = new mongoose.Schema(
  { archivo: { type: String, required: true }, comentario: { type: String, trim: true } },
  { _id: false }
)

const articuloConocimientoSchema = new mongoose.Schema(
  {
    problema: { type: String, required: true, trim: true },
    sintomas: { type: String, trim: true },
    diagnostico: { type: String, trim: true },
    solucion: { type: String, required: true, trim: true },
    evidencias: { type: [evidenciaArticuloSchema], default: [] },
    equiposRelacionados: { type: [String], default: [] },
    palabrasClave: { type: [String], default: [] },
    nivelComplejidad: { type: String, enum: ['baja', 'media', 'alta'], default: 'media' },
    ordenOrigen: { type: mongoose.Schema.Types.ObjectId, ref: 'Mantenimiento' },
    creadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true },
    publicado: { type: Boolean, default: true },
    usosCount: { type: Number, default: 0 },
  },
  { timestamps: { createdAt: 'creado_en', updatedAt: false } }
)

articuloConocimientoSchema.index({ problema: 'text', sintomas: 'text', diagnostico: 'text', solucion: 'text', palabrasClave: 'text' })
articuloConocimientoSchema.index({ equiposRelacionados: 1 })

export default mongoose.model('ArticuloConocimiento', articuloConocimientoSchema)
