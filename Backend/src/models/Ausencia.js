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

// Etapas del trámite de una INCAPACIDAD. Vacaciones y permisos no las usan
// (los decide Talento Humano de una vez); la incapacidad pasa por varias manos:
//   en_verificacion  SIG revisa que el soporte esté completo y legible
//   devuelta         SIG la devolvió al trabajador con lo que falta
//   por_foliar       verificada y aprobada; la Secretaria de Gerencia la folía
//   foliada          foliada, a la espera de que la Gerencia la direccione
//   direccionada     la Gerencia la despachó a una persona de Talento Humano
//   tramitada        Talento Humano la recibió y la tramitó (cierra el ciclo)
// `estado` sigue su significado de siempre: 'pendiente' mientras SIG no la
// apruebe y 'aprobada' desde que la verifica, que es lo que hace que el
// calendario y el control de solapamiento la vean.
export const ETAPAS_INCAPACIDAD = ['en_verificacion', 'devuelta', 'por_foliar', 'foliada', 'direccionada', 'tramitada']

export const ACCIONES_HISTORIAL = [
  'creada', 'verificada', 'devuelta', 'reenviada', 'foliada', 'direccionada', 'folio_completado', 'tramitada', 'cancelada',
]

// Quién hizo qué, congelado al momento (nombre y cargo no se reescriben si la
// persona cambia de cargo). Es la línea de tiempo que ve la supervisión.
const pasoHistorialSchema = new mongoose.Schema(
  {
    accion: { type: String, enum: ACCIONES_HISTORIAL, required: true },
    por: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' },
    nombre: { type: String, trim: true, default: '' },
    cargo: { type: String, trim: true, default: '' },
    fecha: { type: Date, default: Date.now },
    nota: { type: String, trim: true, default: '' },
  },
  { _id: false }
)

const ausenciaSchema = new mongoose.Schema(
  {
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
    // (imagen o PDF) y almacenado localmente en STORAGE_ROOT/ausencias_soportes.
    // Mantiene campos url y publicId por retrocompatibilidad con registros previos.
    soporte: {
      archivo: { type: String, trim: true, default: '' },
      nombreArchivo: { type: String, trim: true, default: '' },
      mimetype: { type: String, trim: true, default: '' },
      size: { type: Number },
      url: { type: String, trim: true, default: '' },
      publicId: { type: String, trim: true, default: '' },
    },

    canceladaEn: { type: Date, default: null },

    // ── Trámite de la incapacidad (solo tipo 'incapacidad') ──────────────
    // Sin default a propósito: en vacaciones y permisos queda undefined y el
    // enum no se dispara. El service lo fija al crear la incapacidad.
    etapa: { type: String, enum: ETAPAS_INCAPACIDAD, index: true },
    // Desde cuándo está en la etapa actual: la supervisión lo usa para ver
    // qué incapacidades llevan demasiado tiempo detenidas.
    etapaDesde: { type: Date },

    // SIG: verificación del soporte. Si la devuelve, el motivo va al historial.
    verificacion: {
      por: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', default: null },
      nombre: { type: String, trim: true, default: '' },
      cargo: { type: String, trim: true, default: '' },
      fecha: { type: Date, default: null },
      observacion: { type: String, trim: true, default: '' },
    },

    // Secretaria de Gerencia: lo que anota al foliar. El destinatario no se
    // conoce aún en ese momento: la Gerencia lo define al direccionar y la
    // Secretaria lo registra después en el folio (destinatarioRegistrado).
    folio: {
      numero: { type: String, trim: true, default: '' },
      observacion: { type: String, trim: true, default: '' },
      fecha: { type: Date, default: null },
      por: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', default: null },
      nombre: { type: String, trim: true, default: '' },
      cargo: { type: String, trim: true, default: '' },
      destinatarioRegistrado: { type: Boolean, default: false },
      destinatarioRegistradoEn: { type: Date, default: null },
      destinatarioRegistradoPor: { type: String, trim: true, default: '' },
    },

    // Gerencia: a quién de Talento Humano va dirigida y con qué mensaje.
    direccionamiento: {
      destinatario: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', default: null },
      nombreDestinatario: { type: String, trim: true, default: '' },
      mensaje: { type: String, trim: true, default: '' },
      fecha: { type: Date, default: null },
      por: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', default: null },
      nombre: { type: String, trim: true, default: '' },
      cargo: { type: String, trim: true, default: '' },
    },

    // Talento Humano: cierre del ciclo.
    tramite: {
      por: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', default: null },
      nombre: { type: String, trim: true, default: '' },
      cargo: { type: String, trim: true, default: '' },
      fecha: { type: Date, default: null },
      observacion: { type: String, trim: true, default: '' },
    },

    historial: { type: [pasoHistorialSchema], default: undefined },
  },
  { timestamps: true }
)

// Sirve a las dos consultas calientes del módulo: "mis ausencias" y la
// detección de solapamiento (solicitante + rango de fechas).
ausenciaSchema.index({ solicitante: 1, fechaInicio: 1, fechaFin: 1 })
// Las bandejas del trámite de incapacidades filtran por tipo + etapa.
ausenciaSchema.index({ tipo: 1, etapa: 1, etapaDesde: 1 })

export default mongoose.model('Ausencia', ausenciaSchema)
