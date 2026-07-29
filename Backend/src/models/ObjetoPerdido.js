import mongoose from 'mongoose'

const objetoPerdidoSchema = new mongoose.Schema(
  {
    descripcion: { type: String, required: true, trim: true },
    lugarHallazgo: { type: String, required: true, trim: true },
    fechaHallazgo: { type: Date, required: true },
    estado: { type: String, enum: ['custodia', 'entregado'], default: 'custodia' },
    entrega: {
      nombre: { type: String, trim: true },
      cedula: { type: String, trim: true },
      telefono: { type: String, trim: true },
      fecha: { type: Date },
      por: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' },
    },
    registradoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true },
  },
  { timestamps: true }
)

objetoPerdidoSchema.index({ estado: 1, fechaHallazgo: -1 })

export default mongoose.model('ObjetoPerdido', objetoPerdidoSchema)
