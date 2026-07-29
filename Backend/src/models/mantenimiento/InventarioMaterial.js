import mongoose from 'mongoose'

// Inventario de repuestos/materiales de mantenimiento (CMMS Fase 3.1, primer
// paso del diseño aprobado: stock simple sin reservas todavía). Acotado a
// mantenimiento a propósito — si el Terminal decide un inventario general
// más adelante, este catálogo puede reutilizarse, no hace falta rehacerlo.
const inventarioMaterialSchema = new mongoose.Schema(
  {
    nombre: { type: String, required: true, unique: true, trim: true },
    stock: { type: Number, default: 0, min: 0 },
    ubicacion: { type: String, trim: true },
    costo_unitario: { type: Number, default: 0, min: 0 },
    // Nombres de otros materiales del catálogo considerados sustitutos.
    equivalentes: { type: [String], default: [] },
  },
  { timestamps: { createdAt: 'creado_en', updatedAt: false } }
)

export default mongoose.model('InventarioMaterial', inventarioMaterialSchema)
