import mongoose from 'mongoose'

const novedadSchema = new mongoose.Schema(
  {
    // 'incidente' requiere el permiso novedades:registrar_incidente (rol
    // Seguridad); 'operativa' basta con novedades:registrar.
    tipo: { type: String, enum: ['operativa', 'incidente'], required: true },
    descripcion: { type: String, required: true, trim: true },
    ubicacion: { type: String, trim: true },
    gravedad: { type: String, enum: ['baja', 'media', 'alta'], default: 'baja' },
    vehiculo: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehiculo', default: null },
    conductor: { type: mongoose.Schema.Types.ObjectId, ref: 'Conductor', default: null },
    estado: { type: String, enum: ['abierta', 'cerrada'], default: 'abierta' },
    cierre: {
      observacion: { type: String, trim: true },
      fecha: { type: Date },
      por: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' },
    },
    reportadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true },
  },
  { timestamps: true }
)

novedadSchema.index({ estado: 1, createdAt: -1 })
novedadSchema.index({ tipo: 1, gravedad: 1 })

export default mongoose.model('Novedad', novedadSchema)
