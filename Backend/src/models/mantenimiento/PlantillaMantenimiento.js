import mongoose from 'mongoose'

// Plantillas de mantenimiento (CMMS Fase 3.1): el mismo catálogo sirve tanto
// para "Checklists Inteligentes" como para "Plantillas de Mantenimiento" —
// una plantilla es un checklist con contexto adicional (herramientas,
// materiales, tiempo estimado, procedimiento, riesgos). Al aplicarse a una
// OT se copia como snapshot (Mantenimiento.checklist), nunca por referencia
// viva, para que una OT ya ejecutada conserve el checklist que usó aunque la
// plantilla cambie después.
const itemChecklistPlantillaSchema = new mongoose.Schema(
  {
    texto: { type: String, required: true, trim: true },
    obligatorioParaCierre: { type: Boolean, default: false },
  },
  { _id: false }
)

const materialSugeridoSchema = new mongoose.Schema(
  { nombre: { type: String, required: true, trim: true }, cantidadEstimada: { type: Number, default: 1 } },
  { _id: false }
)

const plantillaMantenimientoSchema = new mongoose.Schema(
  {
    nombre: { type: String, required: true, trim: true },
    tipoMantenimiento: { type: String, trim: true },
    // Nombres de Equipo.tipo.nombre compatibles; vacío = aplicable a cualquiera.
    tiposEquipoCompatibles: { type: [String], default: [] },
    checklist: { type: [itemChecklistPlantillaSchema], default: [] },
    herramientasSugeridas: { type: [String], default: [] },
    materialesSugeridos: { type: [materialSugeridoSchema], default: [] },
    tiempoEstimadoMinutos: { type: Number },
    procedimiento: { type: String, trim: true },
    riesgos: { type: String, trim: true },
    documentacion: { type: String, trim: true },
    recomendaciones: { type: String, trim: true },
    activa: { type: Boolean, default: true },
    creadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' },
  },
  { timestamps: { createdAt: 'creado_en', updatedAt: false } }
)

plantillaMantenimientoSchema.index({ activa: 1 })

export default mongoose.model('PlantillaMantenimiento', plantillaMantenimientoSchema)
