import mongoose from 'mongoose'

// Historial inmutable de eventos de mantenimiento: quién programó, quién
// activó, cuándo empezó, cuándo terminó, cuándo se canceló y por qué.
//
// Colección aparte de RegistroAuditoria (que también recibe estos eventos)
// por dos razones concretas:
//   1. La auditoría tiene retención móvil de 3 meses (auditoria.worker.js) —
//      se BORRA sola. El historial de indisponibilidad de la plataforma es
//      justamente el dato que alguien va a querer consultar un año después
//      ("¿cuántas ventanas de mantenimiento tuvimos en 2026?").
//   2. Esta pantalla necesita consultar por ciclo de mantenimiento
//      (mantenimientoId), no por usuario/módulo como la auditoría.
const eventoPlataformaSchema = new mongoose.Schema(
  {
    // Agrupa todos los eventos de un mismo ciclo: programado -> iniciado ->
    // finalizado es UNA fila del historial en la UI, no tres sueltas.
    mantenimientoId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },

    tipo: {
      type: String,
      required: true,
      enum: [
        'programado',
        'editado',
        'cancelado',
        'iniciado',            // activación inmediata por un administrador
        'iniciado_automatico', // llegó scheduledStart
        'finalizado',          // botón "Finalizar mantenimiento"
        'finalizado_automatico', // llegó scheduledEnd
      ],
    },

    usuario: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', default: null },
    // Snapshot: el historial debe seguir siendo legible si la cuenta se borra.
    usuarioNombre: { type: String, trim: true, default: 'Sistema' },

    reason: { type: String, trim: true, default: '' },
    message: { type: String, trim: true, default: '' },
    scheduledStart: { type: Date, default: null },
    scheduledEnd: { type: Date, default: null },

    // Solo en los eventos de finalización: cuánto duró realmente la ventana,
    // que casi nunca coincide con lo programado.
    duracionMinutos: { type: Number, default: null },
  },
  { timestamps: { createdAt: 'creadoEn', updatedAt: false } }
)

// El historial se lee siempre "lo más reciente primero".
eventoPlataformaSchema.index({ creadoEn: -1 })

export default mongoose.model('EventoPlataforma', eventoPlataformaSchema)
