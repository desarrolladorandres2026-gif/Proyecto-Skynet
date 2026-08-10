import mongoose from 'mongoose'

// Cola de avisos proactivos pendientes de entregar al widget del copiloto
// (CopilotoWidget.jsx): el hook en utils/sendPush.js encola una fila por
// cada usuario que, según ConfiguracionIA + PreferenciaIA, debe enterarse
// por el chat de un evento que YA se notificó por push/email. El widget hace
// polling de `leido:false`, los pinta como burbuja del asistente, opcionalmente
// los lee en voz, y los marca leídos — no hay WebSocket ni push real aquí.
const avisoIASchema = new mongoose.Schema(
  {
    usuario: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true, index: true },
    categoria: { type: String, required: true },
    titulo: { type: String, required: true },
    cuerpo: { type: String, default: '' },
    url: { type: String },
    leido: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: 'creadoEn', updatedAt: false } }
)

avisoIASchema.index({ usuario: 1, leido: 1, creadoEn: -1 })

// Igual que ConversacionCopiloto: un aviso sin leer en 30 días ya no es
// información útil para nadie, y el TTL evita que la colección crezca sin
// límite si algún usuario nunca abre el chat.
avisoIASchema.index({ creadoEn: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 })

export default mongoose.model('AvisoIA', avisoIASchema)
