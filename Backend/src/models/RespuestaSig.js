import mongoose from 'mongoose'

// Respuesta de un trabajador a una ProgramacionSig publicada. Inmutable una
// vez creada: nunca se edita ni se borra (ni siquiera si la pregunta origen
// cambia después), es el registro histórico que alimenta dashboard, reporte
// individual y plan de refuerzo.
//
// El índice único {programacion, usuario} es la restricción DURA que impide
// responder la misma programación dos veces: vive a nivel de Mongo, no solo
// en el frontend ocultando el botón (ver sig-respuestas.service.js, que
// traduce el choque E11000 a un 409 "Ya respondiste esta pregunta").
const respuestaSigSchema = new mongoose.Schema(
  {
    programacion: { type: mongoose.Schema.Types.ObjectId, ref: 'ProgramacionSig', required: true },
    usuario: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true },
    // Índice dentro de programacion.snapshotPregunta.opciones — nunca se
    // relee PreguntaSig para saber qué se contestó.
    opcionIndice: { type: Number, required: true, min: 0 },
    esCorrecta: { type: Boolean, required: true },
    // Snapshot de quién era el trabajador al responder (mismo criterio que
    // Ausencia.dependenciaSolicitante/cargoSolicitante): si cambia de área
    // después, la respuesta histórica no se reescribe.
    dependenciaSnapshot: { type: String, trim: true, default: '' },
    cargoSnapshot: { type: String, trim: true, default: '' },
    // Denormalizado desde `programacion` exclusivamente para que las
    // agregaciones del dashboard hagan $match directo sin $lookup.
    componenteSigSnapshot: { type: String, trim: true },
    temaSnapshot: { type: String, trim: true },
    fechaProgramada: { type: Date, required: true },
    respondidaEn: { type: Date, default: Date.now },
  },
  { timestamps: true }
)

respuestaSigSchema.index({ programacion: 1, usuario: 1 }, { unique: true })
respuestaSigSchema.index({ usuario: 1, fechaProgramada: -1 })
respuestaSigSchema.index({ fechaProgramada: 1, dependenciaSnapshot: 1 })
respuestaSigSchema.index({ fechaProgramada: 1, componenteSigSnapshot: 1 })
respuestaSigSchema.index({ fechaProgramada: 1, temaSnapshot: 1 })

export default mongoose.model('RespuestaSig', respuestaSigSchema)
