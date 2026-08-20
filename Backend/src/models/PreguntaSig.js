import mongoose from 'mongoose'

// Banco de preguntas de capacitación SIG (Calidad, Ambiental, SST,
// Integración SIG, u otros componentes que se agreguen desde
// ConfiguracionSig.componentes). Una pregunta nunca se borra si ya fue usada
// en alguna ProgramacionSig (ver sig-banco.service.js): se archiva en su
// lugar, para no romper la trazabilidad histórica. El contenido que ve el
// trabajador nunca se relee de aquí una vez publicado — sale del snapshot
// congelado en ProgramacionSig.snapshotPregunta, así que editar una pregunta
// jamás altera una programación ya publicada ni sus respuestas.

const opcionSchema = new mongoose.Schema(
  {
    texto: { type: String, required: true, trim: true },
    esCorrecta: { type: Boolean, default: false },
  },
  { _id: false }
)

const preguntaSigSchema = new mongoose.Schema(
  {
    enunciado: { type: String, required: true, trim: true },
    // Selección única: exactamente 4 opciones, exactamente 1 correcta. El
    // conteo se valida primero en el service (mensajes claros en español);
    // esto es defensa en profundidad para cualquier inserción que no pase
    // por ahí.
    opciones: {
      type: [opcionSchema],
      validate: {
        validator: (v) => Array.isArray(v) && v.length === 4 && v.filter((o) => o.esCorrecta).length === 1,
        message: 'La pregunta debe tener exactamente 4 opciones con una sola respuesta correcta',
      },
    },
    componenteSig: { type: String, required: true, trim: true },
    // Más específico que componenteSig (ej. componente "SST", tema "Uso de
    // EPP en alturas"): gobierna los filtros y el reporte de "temas con
    // mayor cantidad de errores" (ver sig-dashboard.service.js).
    tema: { type: String, required: true, trim: true },
    retroalimentacion: {
      correcta: { type: String, trim: true, default: '' },
      incorrecta: { type: String, trim: true, default: '' },
    },
    etiquetas: { type: [String], default: [] },
    // 'archivada' en vez de borrar: ver sig-banco.service.js — nunca se hace
    // hard-delete de una pregunta que ya fue usada en una programación.
    estado: { type: String, enum: ['activa', 'archivada'], default: 'activa' },
    creadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true },
    actualizadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' },
  },
  { timestamps: true }
)

preguntaSigSchema.index({ estado: 1, componenteSig: 1 })
preguntaSigSchema.index({ estado: 1, tema: 1 })
preguntaSigSchema.index({ enunciado: 'text' })
preguntaSigSchema.index({ etiquetas: 1 })

export default mongoose.model('PreguntaSig', preguntaSigSchema)
