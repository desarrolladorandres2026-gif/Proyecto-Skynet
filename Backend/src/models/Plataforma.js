import mongoose from 'mongoose'

const plataformaSchema = new mongoose.Schema(
  {
    numero: { type: Number, required: true, unique: true },
    tipo: { type: String, enum: ['ascenso', 'descenso'], default: 'ascenso' },
    estado: { type: String, enum: ['libre', 'ocupada', 'mantenimiento'], default: 'libre' },
    // Vehículo actualmente acoderado (solo cuando estado === 'ocupada').
    vehiculoActual: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehiculo', default: null },
  },
  { timestamps: true }
)

export default mongoose.model('Plataforma', plataformaSchema)
