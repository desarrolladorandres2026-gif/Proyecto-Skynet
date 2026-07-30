import mongoose from 'mongoose'

// Cola de trabajos y bitácora de auditoría a la vez: cada fila es UN intento
// de entrega (un canal, un destinatario). notificaciones.service.js inserta
// filas en estado 'pendiente' desde el request original (sin bloquearlo) y
// notificaciones.worker.js las procesa por lotes. Se reutiliza la misma
// colección para ambos propósitos a propósito: evita mantener sincronizadas
// una colección de jobs y una de logs que en la práctica son la misma
// información en dos momentos distintos de su ciclo de vida.
const envioNotificacionSchema = new mongoose.Schema(
  {
    usuario: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true },
    canal: { type: String, enum: ['email', 'push'], required: true },
    // Categoría gobierna la preferencia (ver PreferenciaNotificacion);
    // tipo identifica el evento puntual dentro de esa categoría (p. ej.
    // 'requerimiento:creado') y queda para trazabilidad/depuración.
    categoria: { type: String, required: true, trim: true },
    tipo: { type: String, required: true, trim: true },
    transaccional: { type: Boolean, default: false },
    titulo: { type: String, required: true, trim: true },
    cuerpo: { type: String, required: true, trim: true },
    url: { type: String, trim: true },
    // Solo aplica a canal 'push': a qué suscripción concreta (dispositivo)
    // se le está intentando esta fila. Si la suscripción se borra antes de
    // procesarse (el usuario "olvidó" el dispositivo), el worker la salta.
    pushSubscription: { type: mongoose.Schema.Types.ObjectId, ref: 'PushSubscription' },
    emailDestino: { type: String, trim: true, lowercase: true },
    estado: { type: String, enum: ['pendiente', 'enviado', 'fallido'], default: 'pendiente' },
    intentos: { type: Number, default: 0 },
    maxIntentos: { type: Number, default: 5 },
    proximoIntentoEn: { type: Date, default: Date.now },
    error: { type: String, trim: true },
    enviadoEn: { type: Date },
  },
  { timestamps: true }
)

// El worker filtra exactamente por esta forma (estado + proximoIntentoEn);
// sin el índice compuesto degrada a full collection scan en cada tick.
envioNotificacionSchema.index({ estado: 1, proximoIntentoEn: 1 })
envioNotificacionSchema.index({ usuario: 1, createdAt: -1 })

export default mongoose.model('EnvioNotificacion', envioNotificacionSchema)
