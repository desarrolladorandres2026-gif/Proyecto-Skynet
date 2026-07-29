import mongoose from 'mongoose'

const catalogoRefSchema = new mongoose.Schema(
  {
    id: { type: mongoose.Schema.Types.ObjectId, required: true },
    nombre: { type: String, required: true },
  },
  { _id: false }
)

const equipoSchema = new mongoose.Schema(
  {
    numero_inventario: { type: String, required: true, unique: true, trim: true },
    serial: { type: String, required: true, unique: true, trim: true },
    tipo: { type: catalogoRefSchema, required: true },
    marca: { type: catalogoRefSchema, required: true },
    modelo: { type: String, required: true, trim: true },
    ubicacion: { type: String, required: true, trim: true },
    responsable: { type: String, required: true, trim: true },
    dependencia: { type: String, required: true, trim: true },
    estado_actual: { type: String, required: true, trim: true },
    procesador: { type: String, trim: true },
    ram: { type: String, trim: true },
    disco_duro: { type: String, trim: true },
    sistema_operativo: { type: String, trim: true },
    proveedor: { type: String, trim: true },
    fecha_compra: { type: Date },
    observaciones: { type: String },

    // ── Centro de Activos (CMMS Fase 4) ────────────────────────────────────
    // Determina el SLA/prioridad por defecto sugerida al reportar un problema
    // sobre este equipo (ver diseño aprobado).
    criticidad: { type: String, enum: ['critico', 'importante', 'estandar'], default: 'estandar' },
    garantia_fecha_fin: { type: Date },
    garantia_proveedor: { type: String, trim: true },
    vida_util_anios: { type: Number, min: 0 },
  },
  { timestamps: { createdAt: 'fecha_registro', updatedAt: false } }
)

equipoSchema.pre('save', function capitalizarEstado(next) {
  if (this.isModified('estado_actual') && this.estado_actual) {
    this.estado_actual = this.estado_actual.charAt(0).toUpperCase() + this.estado_actual.slice(1).toLowerCase()
  }
  next()
})

equipoSchema.pre('findOneAndUpdate', function capitalizarEstadoUpdate(next) {
  const update = this.getUpdate()
  if (update?.estado_actual) {
    update.estado_actual = update.estado_actual.charAt(0).toUpperCase() + update.estado_actual.slice(1).toLowerCase()
  }
  next()
})

export default mongoose.model('Equipo', equipoSchema)
