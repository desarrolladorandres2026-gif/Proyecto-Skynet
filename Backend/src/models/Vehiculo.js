import mongoose from 'mongoose'

const vehiculoSchema = new mongoose.Schema(
  {
    placa: { type: String, required: true, unique: true, trim: true, uppercase: true },
    empresa: { type: mongoose.Schema.Types.ObjectId, ref: 'Empresa', required: true },
    tipo: { type: String, enum: ['bus', 'buseta', 'microbus', 'taxi', 'van'], required: true },
    marca: { type: String, trim: true },
    modelo: { type: Number },
    capacidad: { type: Number, required: true, min: 1 },
    // Vencimientos de documentos: el despacho valida que estén vigentes antes
    // de registrar una salida (un vehículo con SOAT vencido no puede rodar).
    soatVence: { type: Date, default: null },
    tecnomecanicaVence: { type: Date, default: null },
    estado: { type: String, enum: ['activo', 'mantenimiento', 'inactivo'], default: 'activo' },
  },
  { timestamps: true }
)

vehiculoSchema.index({ empresa: 1, estado: 1 })

export default mongoose.model('Vehiculo', vehiculoSchema)
