import mongoose from 'mongoose'

const reporteDanoSchema = new mongoose.Schema(
  {
    // 'dano' es el tipo original (foto obligatoria, lo gestiona
    // mantenimiento). Los demás tipos generalizan el mismo formulario a
    // cualquier cosa que un usuario quiera reportar sin que sea un daño
    // físico (novedad, sugerencia, u otro) — la foto es opcional en esos
    // casos (ver danos.controller.js).
    tipo: { type: String, enum: ['dano', 'novedad', 'sugerencia', 'otro'], default: 'dano' },
    // Fecha y hora en que ocurrió/se observó lo reportado, declarada por
    // quien reporta (createdAt de timestamps registra cuándo se envió).
    fecha: { type: Date, required: true },
    descripcion: { type: String, required: true, trim: true },
    // Ausente si tipo !== 'dano' y quien reporta no adjuntó foto.
    foto: {
      url: { type: String },
      // public_id de Cloudinary: permite borrar la imagen si se elimina el reporte.
      publicId: { type: String },
    },
    reportadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true },
    estado: {
      type: String,
      enum: ['pendiente', 'en_proceso', 'resuelto'],
      default: 'pendiente',
    },
    atendidoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', default: null },
    observacionAtencion: { type: String, trim: true },
    fechaResolucion: { type: Date, default: null },
  },
  { timestamps: true }
)

reporteDanoSchema.index({ estado: 1, fecha: -1 })
reporteDanoSchema.index({ reportadoPor: 1, createdAt: -1 })

export default mongoose.model('ReporteDano', reporteDanoSchema)
