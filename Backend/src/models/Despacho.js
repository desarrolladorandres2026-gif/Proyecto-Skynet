import mongoose from 'mongoose'

const despachoSchema = new mongoose.Schema(
  {
    // Consecutivo legible por día (D-20260727-001), generado en el controller.
    consecutivo: { type: String, required: true, unique: true },
    empresa: { type: mongoose.Schema.Types.ObjectId, ref: 'Empresa', required: true },
    vehiculo: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehiculo', required: true },
    conductor: { type: mongoose.Schema.Types.ObjectId, ref: 'Conductor', required: true },
    ruta: { type: mongoose.Schema.Types.ObjectId, ref: 'Ruta', required: true },
    plataforma: { type: mongoose.Schema.Types.ObjectId, ref: 'Plataforma', default: null },
    pasajeros: { type: Number, min: 0, default: 0 },
    horaSalida: { type: Date, required: true },
    horaLlegada: { type: Date, default: null },
    estado: { type: String, enum: ['despachado', 'retrasado', 'finalizado', 'anulado'], default: 'despachado' },
    retraso: {
      minutos: { type: Number, min: 1 },
      motivo: { type: String, trim: true },
    },
    registradoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true },
  },
  { timestamps: true }
)

despachoSchema.index({ empresa: 1, horaSalida: -1 })
despachoSchema.index({ estado: 1, horaSalida: -1 })

export default mongoose.model('Despacho', despachoSchema)
