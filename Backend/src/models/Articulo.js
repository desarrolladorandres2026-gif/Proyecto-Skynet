import mongoose from 'mongoose'

// Catálogo de artículos de Bodega, espejo del inventario que se maneja en
// Elisa. Elisa sigue siendo la fuente de verdad del stock: aquí `existencia`
// es una foto que Bodega refresca subiendo el export (ver
// modules/requerimientos/articulos.service.js#importarExistencias).
// `nombre` se conserva EXACTO como en Elisa para que Bodega pueda buscarlo y
// darle salida allá sin traducir nada.

const presentacionSchema = new mongoose.Schema(
  {
    // "paquete", "caja", "docena"… lo que el solicitante puede pedir.
    nombre: { type: String, required: true, trim: true },
    // Cuántas unidades de Elisa trae una presentación (paquete x 10 → 10).
    factor: { type: Number, required: true, min: 1 },
  },
  { _id: false }
)

const articuloSchema = new mongoose.Schema(
  {
    nombre: { type: String, required: true, trim: true },
    // Clave de unicidad e importación: minúsculas, sin tildes ni signos y con
    // espacios colapsados (ver articulos.busqueda.js#normalizar).
    nombreNormalizado: { type: String, required: true, unique: true },
    grupo: { type: String, trim: true, default: '' },
    existencia: { type: Number, default: 0 },
    existenciaActualizada: { type: Date, default: null },
    // Otras formas en que la gente nombra este artículo ("bolsa negra grande").
    // Se alimentan solas cuando Financiero/Bodega vinculan un texto libre.
    alias: { type: [String], default: [] },
    aliasNormalizados: { type: [String], default: [] },
    presentaciones: { type: [presentacionSchema], default: [] },
    // false = no se ofrece a los solicitantes (p. ej. la fila "NO USAR" de Elisa).
    activo: { type: Boolean, default: true },
  },
  { timestamps: true }
)

articuloSchema.index({ grupo: 1, nombre: 1 })

export default mongoose.model('Articulo', articuloSchema)
