import mongoose from 'mongoose'

export const DIAS_SEMANA = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo']

const horarioSchema = new mongoose.Schema(
  {
    empresa: { type: mongoose.Schema.Types.ObjectId, ref: 'Empresa', required: true },
    ruta: { type: mongoose.Schema.Types.ObjectId, ref: 'Ruta', required: true },
    // "HH:mm" 24h; se guarda como string porque es una hora recurrente sin
    // fecha (un Date la ataría a un día/zona concretos).
    horaSalida: { type: String, required: true, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
    dias: {
      type: [{ type: String, enum: DIAS_SEMANA }],
      validate: { validator: (v) => v.length > 0, message: 'Debe incluir al menos un día' },
    },
    estado: { type: String, enum: ['activo', 'inactivo'], default: 'activo' },
  },
  { timestamps: true }
)

horarioSchema.index({ empresa: 1, ruta: 1, horaSalida: 1 })

export default mongoose.model('Horario', horarioSchema)
