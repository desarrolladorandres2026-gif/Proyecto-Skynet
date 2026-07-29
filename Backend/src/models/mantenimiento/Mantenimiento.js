import mongoose from 'mongoose'

// Estados legado ('pendiente'/'programado'/'finalizado') se conservan en el
// enum junto a los nuevos de la Orden de Trabajo (CMMS Fase 1): así los
// documentos ya existentes siguen siendo válidos sin necesidad de migrarlos
// de inmediato (patrón expand-contract). scripts/migrate-mantenimiento-ot.js
// los traduce a los nuevos cuando se decida aplicar la migración.
const ESTADOS_LEGADO = ['pendiente', 'programado', 'finalizado']
const ESTADOS_OT = [
  'reportado', 'programada', 'asignada', 'en_progreso', 'en_espera',
  'resuelta', 'pendiente_aprobacion', 'cerrada', 'cancelada',
]

const slaSchema = new mongoose.Schema(
  {
    fecha_limite_respuesta: { type: Date },
    fecha_limite_solucion: { type: Date },
    cumplido_respuesta: { type: Boolean, default: null },
    cumplido_solucion: { type: Boolean, default: null },
  },
  { _id: false }
)

const aprobacionSchema = new mongoose.Schema(
  {
    requerida: { type: Boolean, default: false },
    aprobadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' },
    aprobadoEn: { type: Date },
    comentario: { type: String, trim: true },
  },
  { _id: false }
)

// ── Ejecución técnica (CMMS Fase 3) ─────────────────────────────────────────
const llegadaSchema = new mongoose.Schema(
  {
    hora: { type: Date },
    ubicacion: { type: String, trim: true },
    lat: { type: Number },
    lng: { type: Number },
    comentario: { type: String, trim: true },
    foto: { type: String },
  },
  { _id: false }
)

const materialSchema = new mongoose.Schema(
  {
    material: { type: String, required: true, trim: true },
    cantidad: { type: Number, required: true, min: 0 },
    costo_unitario: { type: Number, default: 0, min: 0 },
    proveedor: { type: String, trim: true },
    observaciones: { type: String, trim: true },
    registradoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' },
    registradoEn: { type: Date, default: Date.now },
  },
  { _id: true }
)

const herramientaSchema = new mongoose.Schema(
  {
    herramienta: { type: String, required: true, trim: true },
    tiempo_uso_minutos: { type: Number, min: 0 },
    observaciones: { type: String, trim: true },
    registradoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' },
    registradoEn: { type: Date, default: Date.now },
  },
  { _id: true }
)

const horaSchema = new mongoose.Schema(
  {
    tecnico: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true },
    inicio: { type: Date, required: true },
    fin: { type: Date, required: true },
    pausas_minutos: { type: Number, default: 0, min: 0 },
    tiempo_improductivo_minutos: { type: Number, default: 0, min: 0 },
    motivo_improductivo: { type: String, trim: true },
    es_extra: { type: Boolean, default: false },
    // Calculado en el service, no editable directo: (fin-inicio) - pausas - improductivo.
    tiempo_efectivo_minutos: { type: Number, required: true },
    registradoEn: { type: Date, default: Date.now },
  },
  { _id: true }
)

const evidenciaSchema = new mongoose.Schema(
  {
    tipo: { type: String, enum: ['foto', 'video', 'pdf', 'excel', 'word', 'audio'], required: true },
    momento: { type: String, enum: ['antes', 'durante', 'despues', 'general'], default: 'general' },
    archivo: { type: String, required: true },
    comentario: { type: String, trim: true },
    subidoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' },
    subidoEn: { type: Date, default: Date.now },
  },
  { _id: true }
)

// Sub-flujo de "Solicitar Repuestos" (Fase 3): solicitado -> aprobado/rechazado
// -> en_alistamiento -> entregado -> instalado -> cerrado. Mientras está
// activo, la OT permanece en_espera (motivo_espera:'repuestos').
const solicitudRepuestoSchema = new mongoose.Schema(
  {
    items: [{ nombre: { type: String, trim: true }, cantidad: { type: Number, min: 1 }, _id: false }],
    justificacion: { type: String, trim: true },
    urgencia: { type: String, enum: ['baja', 'media', 'alta'], default: 'media' },
    estado: {
      type: String,
      enum: ['solicitado', 'aprobado', 'rechazado', 'en_alistamiento', 'entregado', 'instalado', 'cerrado'],
      default: 'solicitado',
    },
    solicitadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' },
    solicitadoEn: { type: Date, default: Date.now },
    resueltoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' },
    motivoRechazo: { type: String, trim: true },
    entregadoEn: { type: Date },
    instaladoEn: { type: Date },
  },
  { timestamps: false }
)

// Invitación de apoyo entre técnicos: el invitado debe aceptar para pasar a
// tecnicos_apoyo — nunca se agrega a la fuerza (Fase 3, "Solicitar Apoyo").
const invitacionApoyoSchema = new mongoose.Schema(
  {
    tecnico: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true },
    motivo: { type: String, trim: true },
    estado: { type: String, enum: ['pendiente', 'aceptada', 'rechazada'], default: 'pendiente' },
    invitadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' },
    invitadoEn: { type: Date, default: Date.now },
    respondidoEn: { type: Date },
  },
  { timestamps: false }
)

// Comunicación interna (Fase 3.1): dos canales separados a nivel de dato (no
// solo de interfaz) para que un mensaje interno nunca pueda filtrarse por
// error al solicitante — ver diseño "Comunicación Interna".
const mensajeSchema = new mongoose.Schema(
  {
    canal: { type: String, enum: ['interno', 'solicitante'], required: true },
    texto: { type: String, required: true, trim: true },
    autor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true },
    autorNombre: { type: String, required: true },
    respuestaA: { type: mongoose.Schema.Types.ObjectId },
  },
  { timestamps: { createdAt: 'creado_en', updatedAt: false } }
)

// Snapshot de una PlantillaMantenimiento aplicada a esta OT (copia, no
// referencia viva — ver diseño "Checklists Inteligentes").
const itemChecklistSchema = new mongoose.Schema(
  {
    texto: { type: String, required: true, trim: true },
    obligatorioParaCierre: { type: Boolean, default: false },
    completado: { type: Boolean, default: false },
    omitido: { type: Boolean, default: false },
    motivoOmision: { type: String, trim: true },
    comentario: { type: String, trim: true },
    completadoEn: { type: Date },
  },
  { timestamps: false }
)

const checklistSchema = new mongoose.Schema(
  {
    plantilla: { type: mongoose.Schema.Types.ObjectId, ref: 'PlantillaMantenimiento' },
    plantillaNombre: { type: String, trim: true },
    items: { type: [itemChecklistSchema], default: [] },
  },
  { _id: false }
)

const mantenimientoSchema = new mongoose.Schema(
  {
    equipo: { type: mongoose.Schema.Types.ObjectId, ref: 'Equipo', required: true },
    fecha: { type: Date, required: true },
    fecha_realizacion: { type: Date },
    tipo: { type: String, required: true, trim: true },
    // Legado: nombre libre del técnico. Se conserva para historial que no se
    // pudo vincular a un Usuario real durante la migración (ver
    // tecnico_vinculado); toda OT nueva usa tecnico_asignado.
    tecnico: { type: String, trim: true },
    descripcion: { type: String, required: true },
    estado: {
      type: String,
      enum: [...ESTADOS_LEGADO, ...ESTADOS_OT],
      default: 'pendiente',
    },
    archivo_pdf: { type: String },

    // ── Orden de Trabajo (CMMS Fase 1) ──────────────────────────────────────
    origen: { type: String, enum: ['correctivo', 'preventivo', 'hallazgo', 'manual'], default: 'correctivo' },
    prioridad: { type: String, enum: ['baja', 'media', 'alta', 'critica'], default: 'media' },
    // Quién reportó el problema (Fase 3.1: es el destinatario del canal de
    // comunicación "solicitante"). Null en preventivos/manuales sin reporte.
    reportadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', default: null },
    // Fase 4 (Centro de Activos): si esta OT deja el equipo fuera de
    // servicio, cuenta para el cálculo de disponibilidad del activo.
    afectaDisponibilidad: { type: Boolean, default: true },
    // Timestamps explícitos para el Dashboard Gerencial (Fase 4): sin
    // `updatedAt` habilitado en este esquema, no hay otra forma confiable de
    // saber cuándo se aceptó/cerró una OT que no requiera consultar
    // RegistroAuditoria por cada una.
    fecha_aceptacion: { type: Date },
    fecha_cierre: { type: Date },
    tecnico_asignado: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', default: null },
    // false = migrado desde el campo `tecnico` (texto) sin poder resolverlo a
    // un Usuario real; queda visible para revisión manual, no bloquea nada.
    tecnico_vinculado: { type: Boolean, default: true },
    tecnicos_apoyo: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' }],
    motivo_espera: { type: String, enum: ['repuestos', 'aprobacion', 'informacion', 'apoyo', null], default: null },
    escalado: { type: Boolean, default: false },
    escaladoA: { type: String, trim: true },
    escaladoEn: { type: Date },
    escaladoMotivo: { type: String, trim: true },
    rechazos: { type: Number, default: 0 },
    reaperturas: { type: Number, default: 0 },
    // true en los documentos traducidos por el script de migración desde el
    // esquema legado (aceptación implícita, sin SLA retroactivo calculable).
    migrado_legado: { type: Boolean, default: false },
    // Único dato de la acción "Marcar como Solucionada" (Fase 3) que la
    // transición de la Fase 1 ya necesita para tener sentido; el resto del
    // checklist de completitud (diagnóstico, horas, evidencia) se conecta
    // cuando se implemente esa fase.
    descripcion_solucion: { type: String, trim: true },
    sla: { type: slaSchema, default: () => ({}) },
    aprobacion: { type: aprobacionSchema, default: () => ({}) },

    // ── Ejecución técnica (CMMS Fase 3) ────────────────────────────────────
    // Marcador de progreso puramente informativo (no gatilla transiciones de
    // `estado`): si el técnico se salta un paso, la acción siguiente lo
    // avanza implícitamente en vez de bloquear (ver diseño de Fase 3).
    pasoOperativo: { type: String, enum: ['llegada', 'inspeccion', 'diagnostico', 'ejecucion', 'verificacion', null], default: null },
    llegada: { type: llegadaSchema, default: () => ({}) },
    diagnostico: { type: String, trim: true },
    causa_raiz: { type: String, trim: true },
    nivel_afectacion: { type: String, enum: ['bajo', 'medio', 'alto', 'critico', null], default: null },
    recomendaciones: { type: String, trim: true },
    materiales: { type: [materialSchema], default: [] },
    herramientas: { type: [herramientaSchema], default: [] },
    horas: { type: [horaSchema], default: [] },
    evidencias: { type: [evidenciaSchema], default: [] },
    costo_materiales: { type: Number, default: 0 },
    solicitudesRepuestos: { type: [solicitudRepuestoSchema], default: [] },
    invitacionesApoyo: { type: [invitacionApoyoSchema], default: [] },

    // ── Fase 3.1 ────────────────────────────────────────────────────────────
    mensajes: { type: [mensajeSchema], default: [] },
    checklist: { type: checklistSchema, default: () => ({ items: [] }) },
  },
  { timestamps: { createdAt: 'creado_en', updatedAt: false } }
)

mantenimientoSchema.index({ equipo: 1 })
mantenimientoSchema.index({ estado: 1, fecha: 1 })
mantenimientoSchema.index({ estado: 1, prioridad: 1 })
mantenimientoSchema.index({ tecnico_asignado: 1, estado: 1 })

export default mongoose.model('Mantenimiento', mantenimientoSchema)
