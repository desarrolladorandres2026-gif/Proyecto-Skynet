import mongoose from 'mongoose'

// Una entrada por cada cosa que le pasó al reporte (creación, asignación,
// cambio de estado, requerimiento vinculado). Es la "línea de tiempo" que ve
// el administrador para saber toda la historia sin abrir Auditoría.
// Guarda snapshot del nombre —igual que Requerimiento.nombreAprobador— para
// que el historial se lea sin populate y sobreviva si el usuario se elimina.
const eventoDanoSchema = new mongoose.Schema(
  {
    accion: {
      type: String,
      enum: ['creado', 'asignado', 'reasignado', 'liberado', 'estado', 'requerimiento'],
      required: true,
    },
    de: { type: String },
    a: { type: String },
    // null = lo hizo el sistema (asignación automática al crear el reporte).
    por: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', default: null },
    nombrePor: { type: String, trim: true, default: 'Sistema' },
    nota: { type: String, trim: true },
    fecha: { type: Date, default: Date.now },
  },
  { _id: false }
)

const reporteDanoSchema = new mongoose.Schema(
  {
    // 'dano' es el tipo original (foto obligatoria, lo gestiona
    // mantenimiento). Los demás tipos generalizan el mismo formulario a
    // cualquier cosa que un usuario quiera reportar sin que sea un daño
    // físico (novedad, sugerencia, u otro) — la foto es opcional en esos
    // casos (ver danos.controller.js).
    tipo: { type: String, enum: ['dano', 'novedad', 'sugerencia', 'otro'], default: 'dano' },
    // Fecha y hora en que ocurrió/se observó lo reportado, declarada por
    // quien reporta (createdAt de timestamps registra cuándo se envió).
    fecha: { type: Date, required: true },
    descripcion: { type: String, required: true, trim: true },
    // Ausente si tipo !== 'dano' y quien reporta no adjuntó foto.
    foto: {
      url: { type: String },
      // public_id de Cloudinary: permite borrar la imagen si se elimina el reporte.
      publicId: { type: String },
    },
    reportadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true },

    // Máquina de estados: las transiciones válidas viven SOLO en
    // danos.service.js (TRANSICIONES). 'pendiente'/'en_proceso'/'resuelto'
    // son los tres estados originales y conservan su nombre para que los
    // reportes ya existentes en la BD sigan siendo válidos sin migración.
    estado: {
      type: String,
      enum: ['pendiente', 'asignado', 'en_proceso', 'en_espera', 'resuelto', 'cancelado'],
      default: 'pendiente',
    },
    // Ordena la cola de trabajo y alimenta el desempate de la asignación
    // automática. La fija quien gestiona (el formulario del reportante no la
    // pide: un usuario cualquiera no puede juzgar la criticidad real).
    prioridad: { type: String, enum: ['baja', 'media', 'alta', 'critica'], default: 'media' },

    // ── Asignación ────────────────────────────────────────────────────
    // Técnico de mantenimiento responsable AHORA de reparar. Distinto de
    // atendidoPor (abajo), que es solo quien ejecutó la última acción.
    asignadoA: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', default: null },
    // null cuando la asignación fue automática (nadie la decidió a mano).
    asignadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', default: null },
    asignadoEn: { type: Date, default: null },
    asignacionAutomatica: { type: Boolean, default: false },

    // ── Ejecución ─────────────────────────────────────────────────────
    // Por qué está detenido: 'repuestos' es el que empuja al técnico hacia el
    // módulo de Requerimientos (ver requerimientos[] abajo).
    motivoEspera: {
      type: String,
      enum: ['repuestos', 'aprobacion', 'informacion', 'apoyo'],
      default: null,
    },
    // Requerimientos de compra/servicio creados para poder reparar este daño.
    // La contraparte es Requerimiento.origenDano (relación bidireccional: el
    // reporte lista los suyos sin consultar, el requerimiento sabe de dónde
    // salió sin depender de este array).
    requerimientos: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Requerimiento' }],

    // Legado: antes era "el que tocó el reporte" y se pisaba en cada cambio de
    // estado. Ahora significa quien ejecutó la ÚLTIMA acción — la responsa-
    // bilidad vive en asignadoA. Se conserva para no perder el dato de los
    // reportes anteriores a la asignación.
    atendidoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', default: null },
    observacionAtencion: { type: String, trim: true },
    fechaResolucion: { type: Date, default: null },

    // Datos obligatorios para marcar un daño como 'resuelto' (ver
    // cambiarEstadoReporte en danos.service.js): sin los tres, la orden no
    // puede finalizarse. `evidencias` es aparte de `foto` (la del reporte
    // original) — esta es la prueba de que SE REPARÓ, no de que se rompió.
    reparacion: {
      fecha: { type: Date, default: null },
      modulo: { type: String, enum: ['regional', 'centenario', 'modulo_mixto', null], default: null },
      evidencias: {
        type: [{ url: { type: String, required: true }, publicId: { type: String } }],
        default: [],
      },
    },

    historial: { type: [eventoDanoSchema], default: [] },
  },
  { timestamps: true }
)

reporteDanoSchema.index({ estado: 1, fecha: -1 })
reporteDanoSchema.index({ reportadoPor: 1, createdAt: -1 })
// Cola de trabajo del técnico ("mis tareas") y conteo de carga por técnico
// que usa la asignación automática.
reporteDanoSchema.index({ asignadoA: 1, estado: 1 })

export default mongoose.model('ReporteDano', reporteDanoSchema)
