import mongoose from 'mongoose'

// Bitácora Operativa (Work Log, CMMS Fase 3.1): narrativa libre del trabajo
// en campo, independiente del Timeline de transiciones formales — aquí el
// registro ES la auditoría (nunca se edita ni se borra, solo se agregan
// entradas nuevas, incluso para "corregir" una anterior).
const bitacoraEntradaSchema = new mongoose.Schema(
  {
    ordenTrabajo: { type: mongoose.Schema.Types.ObjectId, ref: 'Mantenimiento', required: true },
    tipo: {
      type: String,
      enum: ['observacion', 'incidente', 'llamada', 'visita_externa', 'prueba', 'resultado', 'nota'],
      default: 'nota',
    },
    texto: { type: String, trim: true },
    adjunto: { type: String },
    etiquetas: { type: [String], default: [] },
    usuario: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true },
    usuarioNombre: { type: String, required: true },
  },
  { timestamps: { createdAt: 'creado_en', updatedAt: false } }
)

bitacoraEntradaSchema.index({ ordenTrabajo: 1, creado_en: -1 })
bitacoraEntradaSchema.index({ texto: 'text', etiquetas: 'text' })

export default mongoose.model('BitacoraEntrada', bitacoraEntradaSchema)
