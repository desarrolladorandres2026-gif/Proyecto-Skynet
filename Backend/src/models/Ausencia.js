import mongoose from 'mongoose'

// Vacaciones, permisos e incapacidades son UNA sola entidad con un campo
// `tipo`, no tres colecciones paralelas: las tres comparten exactamente el
// mismo flujo solicitud -> aprobación/rechazo, y separarlas obligaría a
// reimplementarlo (y a mantenerlo) tres veces. Ver
// docs/arquitectura/01-talento-humano.md §"Candidata: Ausencia".
//
// 'permiso' se partió en remunerado/no_remunerado: el CST (art. 57, mod. Ley
// 2466 de 2025) obliga a pagar el permiso en supuestos tasados (luto,
// calamidad doméstica, cita médica, citación de autoridad, sufragio, jurado
// de votación, obligación escolar, sindical) — fuera de esos casos es
// discrecional del Terminal. Talento Humano necesita saber cuál es cuál para
// nómina, no basta con "permiso" a secas.
export const TIPOS_AUSENCIA = ['vacaciones', 'permiso_remunerado', 'permiso_no_remunerado', 'incapacidad']

// Causales legales que obligan a remunerar el permiso (ver TIPOS_AUSENCIA
// arriba). 'otro' cubre lo que el Terminal decide pagar por su cuenta aunque
// la ley no lo exija — sigue siendo "remunerado" para nómina, solo cambia el
// respaldo legal.
export const MOTIVOS_PERMISO_REMUNERADO = [
  'luto',
  'calamidad_domestica',
  'cita_medica',
  'citacion_autoridad',
  'sufragio',
  'jurado_votacion',
  'obligacion_escolar',
  'sindical',
  'otro',
]

export const ESTADOS_AUSENCIA = ['pendiente', 'aprobada', 'rechazada', 'cancelada']

const ausenciaSchema = new mongoose.Schema(
  {
    // Cuelga de Usuario, no de Empleado: Empleado es Talento Humano Fase 1 y
    // todavía no existe. Cuando exista, migrar es agregar `empleado` y
    // resolverlo desde este mismo `solicitante` (relación 1:1), no rehacer
    // el módulo.
    solicitante: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true, index: true },

    tipo: { type: String, enum: TIPOS_AUSENCIA, required: true },

    // Solo aplica (y solo se exige) cuando tipo === 'permiso_remunerado'; el
    // service es quien valida esa condicionalidad, no el schema — mismo
    // criterio que soporte más abajo para 'incapacidad'. Sin default: así el
    // enum de Mongoose no se dispara sobre documentos que no lo usan.
    motivoLicencia: { type: String, enum: MOTIVOS_PERMISO_REMUNERADO },

    // Ambas inclusivas: una ausencia de un solo día lleva inicio === fin.
    fechaInicio: { type: Date, required: true },
    fechaFin: { type: Date, required: true },

    // Rango horario opcional, solo tiene sentido cuando la ausencia es de UN
    // solo día (fechaInicio === fechaFin): p. ej. un permiso de dos horas
    // para una cita médica no consume el día completo. "HH:mm" en hora
    // local del Terminal; el service es quien exige que vengan juntas y que
    // horaFin sea posterior a horaInicio, igual criterio que motivoLicencia
    // más abajo.
    horaInicio: { type: String, trim: true, default: '' },
    horaFin: { type: String, trim: true, default: '' },

    // Días naturales calculados en el service al crear y congelados aquí: si
    // mañana cambia la forma de contarlos, las solicitudes ya aprobadas
    // conservan el número con el que se aprobaron (igual criterio que los
    // snapshots de cargo en Requerimientos). Cuenta TODOS los días del rango,
    // sin excluir sábados/domingos ni festivos: el Terminal opera 24/7, así
    // que no existe un "día no laborable" que descontar.
    diasHabiles: { type: Number, required: true, min: 1 },

    motivo: { type: String, trim: true },

    // Snapshot al momento de solicitar. Si la persona cambia de cargo o de
    // dependencia después, la solicitud ya decidida no se reescribe.
    cargoSolicitante: { type: String, trim: true, default: '' },
    dependenciaSolicitante: { type: String, trim: true, default: '' },

    estado: { type: String, enum: ESTADOS_AUSENCIA, default: 'pendiente', index: true },

    decision: {
      revisadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', default: null },
      nombreRevisor: { type: String, trim: true, default: '' },
      cargoRevisor: { type: String, trim: true, default: '' },
      fecha: { type: Date, default: null },
      // Obligatorio al rechazar (lo exige el service), vacío al aprobar.
      motivoRechazo: { type: String, trim: true, default: '' },
      observacion: { type: String, trim: true, default: '' },
    },

    // Soporte de la incapacidad (certificado médico), adjuntado como archivo
    // (imagen o PDF) y subido a Cloudinary — ver ausencias.controller.js.
    // Sigue siendo deliberadamente simple: UN archivo vigente, sin
    // versionado ni control de vencimientos; eso es Talento Humano Fase 3.
    soporte: {
      url: { type: String, trim: true, default: '' },
      publicId: { type: String, trim: true, default: '' },
      nombreArchivo: { type: String, trim: true, default: '' },
    },

    canceladaEn: { type: Date, default: null },
  },
  { timestamps: true }
)

// Sirve a las dos consultas calientes del módulo: "mis ausencias" y la
// detección de solapamiento (solicitante + rango de fechas).
ausenciaSchema.index({ solicitante: 1, fechaInicio: 1, fechaFin: 1 })

export default mongoose.model('Ausencia', ausenciaSchema)
