import mongoose from 'mongoose'

const rutaSchema = new mongoose.Schema(
  {
    origen: { type: String, required: true, trim: true, default: 'Neiva' },
    destino: { type: String, required: true, trim: true },
    // Paradas intermedias, en orden.
    paradas: { type: [String], default: [] },
    duracionEstimadaMin: { type: Number, min: 1 },
    estado: { type: String, enum: ['activa', 'inactiva'], default: 'activa' },
  },
  { timestamps: true }
)

rutaSchema.index({ destino: 1 })

export default mongoose.model('Ruta', rutaSchema)
