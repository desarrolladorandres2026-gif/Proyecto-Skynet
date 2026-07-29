import mongoose from 'mongoose'

// Tiempos objetivo de respuesta/solución por prioridad de Orden de Trabajo.
// Editable por un administrador sin tocar código (a diferencia de tener los
// umbrales hardcodeados en el service) — sincronizarConfiguracionSLA() solo
// crea las filas que falten (upsert $setOnInsert), nunca pisa un valor ya
// ajustado manualmente.
const configuracionSLASchema = new mongoose.Schema(
  {
    prioridad: { type: String, enum: ['baja', 'media', 'alta', 'critica'], required: true, unique: true },
    horas_respuesta: { type: Number, required: true },
    horas_solucion: { type: Number, required: true },
  },
  { timestamps: true }
)

export default mongoose.model('ConfiguracionSLA', configuracionSLASchema)
