import mongoose from 'mongoose'

// Capacitación programada sobre UN tema, dirigida a un grupo de trabajadores
// (o a todos) — a diferencia de PlanRefuerzoSig (que nace automáticamente por
// trabajador+componente cuando el desempeño cae a Bajo/Crítico), esta la crea
// a mano quien gestiona SIG para reforzar un tema puntual sin esperar a que
// alguien falle. El resumen ("cuántos ya reforzaron ese tema") sale de marcar
// manualmente a cada participante como completado — no hay evaluación
// automática detrás.
const participanteSchema = new mongoose.Schema(
  {
    usuario: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true },
    completado: { type: Boolean, default: false },
    fechaCompletado: { type: Date, default: null },
  },
  { _id: false }
)

const capacitacionTemaSigSchema = new mongoose.Schema(
  {
    tema: { type: String, required: true, trim: true },
    componenteSig: { type: String, trim: true, default: '' },
    descripcion: { type: String, trim: true, default: '' },
    fechaProgramada: { type: Date, required: true },
    responsable: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', default: null },
    // Misma forma canónica que ProgramacionSig/CampanaSig (ver
    // normalizarAudiencia en comun.js): { todos: true } o
    // { todos: false, dependencias: [...], cargos: [...] }.
    audiencia: {
      todos: { type: Boolean, default: true },
      dependencias: { type: [String], default: [] },
      cargos: { type: [String], default: [] },
    },
    estado: { type: String, enum: ['programada', 'realizada', 'cancelada'], default: 'programada' },
    // Snapshot de a quién le tocaba al momento de crear la capacitación: si
    // alguien cambia de área después, la lista de participantes no se mueve
    // sola (mismo criterio que la audiencia resuelta de ProgramacionSig).
    participantes: { type: [participanteSchema], default: [] },
  },
  { timestamps: true }
)

capacitacionTemaSigSchema.index({ estado: 1, fechaProgramada: -1 })

export default mongoose.model('CapacitacionTemaSig', capacitacionTemaSigSchema)
