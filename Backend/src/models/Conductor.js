import mongoose from 'mongoose'

const conductorSchema = new mongoose.Schema(
  {
    cedula: { type: String, required: true, unique: true, trim: true },
    nombre: { type: String, required: true, trim: true },
    empresa: { type: mongoose.Schema.Types.ObjectId, ref: 'Empresa', required: true },
    telefono: { type: String, trim: true },
    licencia: {
      numero: { type: String, trim: true },
      categoria: { type: String, trim: true },
      // El despacho valida vigencia: un conductor con licencia vencida no
      // puede ser asignado a una salida.
      vence: { type: Date, default: null },
    },
    estado: { type: String, enum: ['activo', 'inactivo'], default: 'activo' },
  },
  { timestamps: true }
)

conductorSchema.index({ empresa: 1, estado: 1 })

export default mongoose.model('Conductor', conductorSchema)
