import mongoose from 'mongoose'

// Aprobación fuera de banda para conectar una cuenta de Gmail: quien hace
// clic en "Conectar" dentro de Skynet no completa la conexión ahí mismo —
// primero se le envía un correo de alerta a su cuenta REGISTRADA en Skynet
// (Usuario.email, no la que se está conectando) describiendo el intento, y
// solo si aprueba desde ese correo se continúa hacia el consentimiento real
// de Google. Mismo espíritu que PasswordResetToken (token plano de un solo
// uso con expiración), aplicado a una acción sensible distinta.
const emailConexionSolicitudSchema = new mongoose.Schema(
  {
    usuario: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true },
    token: { type: String, required: true, unique: true },
    estado: { type: String, enum: ['pendiente', 'aprobada', 'denegada', 'usada'], default: 'pendiente' },
    ip: { type: String },
    userAgent: { type: String },
    expira_en: { type: Date, required: true },
  },
  { timestamps: true }
)

export default mongoose.model('EmailConexionSolicitud', emailConexionSolicitudSchema)
