import mongoose from 'mongoose'

const mensajeSchema = new mongoose.Schema(
  {
    texto_mensaje: { type: String },
    url_imagen_mensaje: { type: String },
    usuario: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' },
    fecha_mensaje: { type: Date, default: Date.now },
    leido_mensaje: { type: Boolean, default: false },
  }
)

const ultimoVistoSchema = new mongoose.Schema(
  {
    usuario: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true },
    visto_en: { type: Date, required: true },
  },
  { _id: false }
)

const ticketSchema = new mongoose.Schema(
  {
    titulo_ticket: { type: String, required: true, trim: true },
    descripcion_ticket: { type: String, default: '' },
    fecha_creacion_ticket: { type: Date, default: Date.now },
    fecha_cierre_ticket: { type: Date },
    modulo_origen: { type: String, required: true },
    nivel_urgencia: { type: String, required: true },
    estado: {
      type: String,
      enum: ['Nuevo', 'Asignado', 'En progreso', 'Resuelto', 'Cerrado'],
      default: 'Nuevo',
    },
    usuario_creador: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true },
    usuario_asignado: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' },
    mensajes: [mensajeSchema],
    ultimo_visto: [ultimoVistoSchema],
  },
  { timestamps: false }
)

ticketSchema.index({ estado: 1 })
ticketSchema.index({ modulo_origen: 1 })
ticketSchema.index({ usuario_creador: 1 })
ticketSchema.index({ usuario_asignado: 1 })
ticketSchema.index({ fecha_creacion_ticket: -1 })

export default mongoose.model('Ticket', ticketSchema)
