import mongoose from 'mongoose'

// Campaña de publicación recurrente: el administrador (rol SIG/HSEQ) elige
// un pool de preguntas y una recurrencia, y el sistema calcula en bulk todas
// las ProgramacionSig resultantes al crearla (ver sig-campanas.service.js).
// Esta colección es solo el "padre" informativo/de control (pausar,
// reanudar, cancelar) — el motor de publicación (sig.worker.js) nunca la
// consulta directamente, solo conoce ProgramacionSig.

const campanaSigSchema = new mongoose.Schema(
  {
    nombre: { type: String, required: true, trim: true },
    descripcion: { type: String, trim: true, default: '' },
    // Pool de preguntas que rota a lo largo de la campaña, en el orden en que
    // se seleccionaron (modoAsignacion:'secuencial' respeta este orden tal
    // cual).
    preguntas: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'PreguntaSig' }],
      validate: {
        validator: (v) => Array.isArray(v) && v.length > 0,
        message: 'La campaña necesita al menos una pregunta',
      },
    },
    modoAsignacion: { type: String, enum: ['secuencial', 'aleatoria', 'manual'], default: 'secuencial' },
    recurrencia: {
      tipo: { type: String, enum: ['diaria', 'dias_semana', 'personalizada'], required: true },
      // 0=domingo..6=sábado (Date.getUTCDay). Un solo día seleccionado cubre
      // el caso "semanal" de la especificación funcional.
      diasSemana: { type: [Number], default: [] },
      fechasPersonalizadas: { type: [String], default: [] }, // 'YYYY-MM-DD'
    },
    // Ambas vía inicioDelDia() — representan un DÍA, no un instante.
    fechaInicio: { type: Date, required: true },
    fechaFin: { type: Date, required: true },
    fechasExcluidas: { type: [String], default: [] }, // 'YYYY-MM-DD'
    // 'HH:mm' hora del Terminal; si se omite, sig-campanas.service.js hereda
    // ConfiguracionSig.horaPublicacionDefecto al momento de crear.
    horaPublicacion: { type: String, required: true, trim: true },
    audiencia: {
      todos: { type: Boolean, default: true },
      dependencias: { type: [String], default: [] },
      cargos: { type: [String], default: [] },
    },
    estado: { type: String, enum: ['activa', 'pausada', 'finalizada', 'cancelada'], default: 'activa' },
    // Denormalizado desde el bulk-insert de ProgramacionSig, solo informativo
    // para no tener que contar la colección hija en cada listado.
    totalProgramaciones: { type: Number, default: 0 },
    creadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true },
  },
  { timestamps: true }
)

campanaSigSchema.index({ estado: 1, fechaInicio: 1, fechaFin: 1 })

export default mongoose.model('CampanaSig', campanaSigSchema)
