import mongoose from 'mongoose'

// Rastro auditable de cada movimiento de inventario (CMMS Fase 3.1): nunca
// se descuenta/ajusta stock sin dejar constancia de quién, cuánto y por qué.
const movimientoInventarioSchema = new mongoose.Schema(
  {
    material: { type: mongoose.Schema.Types.ObjectId, ref: 'InventarioMaterial', required: true },
    ordenTrabajo: { type: mongoose.Schema.Types.ObjectId, ref: 'Mantenimiento' },
    tipo: { type: String, enum: ['consumo', 'devolucion', 'desperdicio', 'ajuste'], required: true },
    cantidad: { type: Number, required: true },
    motivo: { type: String, trim: true },
    usuario: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true },
  },
  { timestamps: { createdAt: 'creado_en', updatedAt: false } }
)

movimientoInventarioSchema.index({ material: 1, creado_en: -1 })

export default mongoose.model('MovimientoInventario', movimientoInventarioSchema)
