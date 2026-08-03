import mongoose from 'mongoose'

// Digitalización de 2 formatos institucionales del Terminal (FO-GBS-09
// "Solicitud de Requerimiento" para compra de bienes, FO-GBS-36
// "Requerimiento de Servicios"). Esquema ancho con campos condicionales por
// `tipo` (mismo criterio "modo expand" que Mantenimiento.js), no Mongoose
// discriminators reales: ambos tipos comparten el mismo motor de flujo
// Solicitante -> Financiero -> Bodega y no vale la pena duplicarlo.

const controlRecibidoSchema = new mongoose.Schema(
  {
    recibido: { type: Boolean, default: false },
    fecha: { type: Date, default: null },
    marcadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' },
    observacion: { type: String, trim: true },
  },
  { _id: false }
)

// Fila de la tabla de FO-GBS-09. El papel tenía 13 filas fijas; aquí es un
// array dinámico sin tope.
const itemCompraSchema = new mongoose.Schema(
  {
    fechaSolicitud: { type: Date, required: true },
    descripcionProducto: { type: String, required: true, trim: true },
    cantidad: { type: Number, required: true, min: 1 },
    destino: { type: String, trim: true },
    // Solo la llena Bodega, y solo cuando bodega.estado ya es 'aprobada'
    // (ver requerimientos.service.js) — paso posterior y distinto a esa
    // decisión, no se confunde con ella.
    controlRecibido: { type: controlRecibidoSchema, default: () => ({}) },
  },
  { timestamps: false }
)

// Campos 3-5 de FO-GBS-36. El formato de servicio no tiene tabla de ítems.
const detalleServicioSchema = new mongoose.Schema(
  {
    descripcionTipoServicio: { type: String, required: true, trim: true },
    competencia: { type: String, trim: true },
    laboresADesarrollar: { type: String, trim: true },
    requisitosSST: { type: String, trim: true },
  },
  { _id: false }
)

// Un registro por cada edición de Financiero antes de aprobar: snapshot de
// cómo estaban los campos editables justo ANTES de ese cambio puntual, para
// poder reconstruir versión-solicitada -> ... -> versión-aprobada.
const historialEdicionSchema = new mongoose.Schema(
  {
    editadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true },
    nombreEditor: { type: String, required: true },
    fecha: { type: Date, default: Date.now },
    snapshotAntes: { type: mongoose.Schema.Types.Mixed, required: true },
    comentario: { type: String, trim: true },
  },
  { timestamps: false }
)

const requerimientoSchema = new mongoose.Schema(
  {
    tipo: { type: String, enum: ['compra', 'servicio'], required: true },

    // Motor de flujo entre actores. Deliberadamente NO incluye
    // aprobada/no_aprobada/pendiente de Bodega (eso vive en bodega.estado,
    // ver abajo) — mismo criterio que Mantenimiento.aprobacion{}: el detalle
    // de una sub-decisión no se mezcla con el enum de flujo raíz.
    estado: {
      type: String,
      enum: ['pendiente_financiero', 'pendiente_bodega', 'rechazado'],
      default: 'pendiente_financiero',
    },

    solicitante: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true },
    // Trazabilidad hacia atrás: si el requerimiento nació desde un reporte de
    // daño ("necesito este repuesto para poder repararlo"), aquí queda cuál.
    // La contraparte es ReporteDano.requerimientos — se guardan los dos lados
    // para que ninguna de las dos vistas necesite consultar la otra colección.
    origenDano: { type: mongoose.Schema.Types.ObjectId, ref: 'ReporteDano', default: null },
    // Snapshot: prellenado desde Usuario.cargo al crear pero editable, y no
    // se recalcula si el usuario cambia de cargo después.
    cargoSolicitante: { type: String, trim: true, required: true },
    areaOProceso: { type: String, trim: true },
    fechaSolicitud: { type: Date, default: Date.now },

    // Copia congelada de lo enviado originalmente por el solicitante
    // (itemsCompra/detalleServicio/areaOProceso), tomada una sola vez al
    // crear — permite comparar contra lo que Financiero termine aprobando.
    versionOriginal: { type: mongoose.Schema.Types.Mixed, required: true },

    // ── tipo: compra ──────────────────────────────────────────────────
    itemsCompra: { type: [itemCompraSchema], default: undefined },

    // ── tipo: servicio ────────────────────────────────────────────────
    detalleServicio: { type: detalleServicioSchema, default: undefined },

    // ── Etapa Financiero ──────────────────────────────────────────────
    financiero: {
      // "Análisis técnico del requerimiento" del formato de compra: en el
      // papel lo diligencia el Ingeniero de Sistemas; aquí lo llena
      // Financiero, sin crear un rol nuevo.
      analisisTecnico: { type: String, trim: true },
      aprobadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' },
      // Snapshots para que el PDF firmado no cambie si el usuario edita su
      // perfil después.
      nombreAprobador: { type: String, trim: true },
      cargoAprobador: { type: String, trim: true },
      fechaDecision: { type: Date },
      motivoRechazo: { type: String, trim: true },
      historialEdiciones: { type: [historialEdicionSchema], default: [] },
    },

    // ── Etapa Bodega ──────────────────────────────────────────────────
    bodega: {
      estado: { type: String, enum: ['pendiente', 'aprobada', 'no_aprobada'], default: 'pendiente' },
      revisadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' },
      nombreRevisor: { type: String, trim: true },
      // Snapshot igual que financiero.cargoAprobador: no se recalcula si el
      // revisor cambia de cargo después.
      cargoRevisor: { type: String, trim: true },
      fecha: { type: Date },
      observacion: { type: String, trim: true },
    },
  },
  { timestamps: true }
)

requerimientoSchema.index({ solicitante: 1, createdAt: -1 })
requerimientoSchema.index({ estado: 1, createdAt: -1 })
requerimientoSchema.index({ 'bodega.estado': 1 })

export default mongoose.model('Requerimiento', requerimientoSchema)
