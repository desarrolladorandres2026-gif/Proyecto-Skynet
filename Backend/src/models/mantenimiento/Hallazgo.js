import mongoose from 'mongoose'

// Colección propia (no embebida en Mantenimiento) a propósito: la Fase 4
// (Centro de Hallazgos) necesita consultar/agrupar hallazgos a través de
// TODAS las órdenes de trabajo, algo incómodo y poco indexable si vivieran
// como subdocumentos dentro de cada OT.
const evidenciaHallazgoSchema = new mongoose.Schema(
  {
    archivo: { type: String, required: true },
    comentario: { type: String, trim: true },
  },
  { _id: false }
)

const hallazgoSchema = new mongoose.Schema(
  {
    ordenTrabajo: { type: mongoose.Schema.Types.ObjectId, ref: 'Mantenimiento', required: true },
    categoria: { type: String, trim: true },
    tipo: { type: String, trim: true },
    criticidad: { type: String, enum: ['baja', 'media', 'alta', 'critica'], required: true },
    riesgo: { type: String, trim: true },
    descripcion: { type: String, required: true, trim: true },
    evidencias: { type: [evidenciaHallazgoSchema], default: [] },
    recomendacion: { type: String, trim: true },
    accion_correctiva: { type: String, trim: true },
    accion_preventiva: { type: String, trim: true },
    responsable: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' },
    fecha_limite: { type: Date },
    estado: {
      type: String,
      enum: ['abierto', 'en_seguimiento', 'resuelto', 'convertido_en_ot'],
      default: 'abierto',
    },
    // Riesgo aceptado formalmente por un supervisor en vez de convertirse en
    // OT — decisión trazable, nunca un hallazgo que simplemente "desaparece".
    riesgoAceptado: {
      aceptado: { type: Boolean, default: false },
      justificacion: { type: String, trim: true },
      aceptadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' },
      aceptadoEn: { type: Date },
      reevaluarEn: { type: Date },
    },
    ordenTrabajoGenerada: { type: mongoose.Schema.Types.ObjectId, ref: 'Mantenimiento', default: null },
    registradoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true },
  },
  { timestamps: { createdAt: 'creado_en', updatedAt: false } }
)

hallazgoSchema.index({ ordenTrabajo: 1 })
hallazgoSchema.index({ estado: 1, criticidad: 1 })
hallazgoSchema.index({ responsable: 1, estado: 1 })

export default mongoose.model('Hallazgo', hallazgoSchema)
