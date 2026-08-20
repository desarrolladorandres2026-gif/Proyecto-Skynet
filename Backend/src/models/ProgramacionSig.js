import mongoose from 'mongoose'

// Unidad atómica de publicación: el corazón del motor de programación. Una
// campaña genera muchos de estos en bulk al crearse (campana != null); una
// pregunta suelta crea uno solo (campana: null). El worker de publicación
// (sig.worker.js) SOLO conoce esta colección — nunca sabe si el origen fue
// individual o campaña, así que es el mismo código para los dos casos.
//
// snapshotPregunta se congela UNA VEZ, atómicamente, en el mismo
// findOneAndUpdate que transiciona estado -> 'publicada' (ver
// sig-programaciones.service.js#publicarPendientes). Es la pieza de
// inmutabilidad: el trabajador nunca lee PreguntaSig directamente, así que
// editar o archivar la pregunta original después de publicada no cambia
// nada de lo que ya se mostró ni de las respuestas ya registradas.

const opcionSnapshotSchema = new mongoose.Schema(
  { texto: String, esCorrecta: Boolean },
  { _id: false }
)

const programacionSigSchema = new mongoose.Schema(
  {
    campana: { type: mongoose.Schema.Types.ObjectId, ref: 'CampanaSig', default: null },
    pregunta: { type: mongoose.Schema.Types.ObjectId, ref: 'PreguntaSig', required: true },
    fechaProgramada: { type: Date, required: true }, // día calendario, via inicioDelDia()
    // Instante exacto de publicación (día + hora, via instanteLocal()) — el
    // único campo que consulta el worker en cada tick.
    fechaHoraPublicacion: { type: Date, required: true },
    audiencia: {
      todos: { type: Boolean, default: true },
      dependencias: { type: [String], default: [] },
      cargos: { type: [String], default: [] },
    },
    // Máquina de estados que garantiza idempotencia: la transición a
    // 'publicada' ocurre con un findOneAndUpdate({_id, estado:'programada'})
    // atómico (compare-and-swap), así que un tick duplicado del worker
    // nunca publica ni notifica dos veces.
    estado: { type: String, enum: ['programada', 'publicada', 'cancelada'], default: 'programada' },
    publicadaEn: { type: Date, default: null },
    snapshotPregunta: {
      enunciado: String,
      opciones: [opcionSnapshotSchema],
      componenteSig: String,
      tema: String,
    },
    cancelacion: {
      canceladaPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' },
      motivo: { type: String, trim: true },
      fecha: { type: Date },
    },
    creadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true },
  },
  { timestamps: true }
)

// El índice que usa el worker en cada tick.
programacionSigSchema.index({ estado: 1, fechaHoraPublicacion: 1 })
// Evita duplicar el día de una campaña si el bulk-insert se reintenta.
programacionSigSchema.index(
  { campana: 1, fechaProgramada: 1 },
  { unique: true, partialFilterExpression: { campana: { $type: 'objectId' } } }
)
programacionSigSchema.index({ fechaProgramada: 1 }) // vista calendario
programacionSigSchema.index({ pregunta: 1 }) // saber si una pregunta ya se usó (regla de DELETE del banco)

export default mongoose.model('ProgramacionSig', programacionSigSchema)
