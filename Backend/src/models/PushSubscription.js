import mongoose from 'mongoose'

const pushSubscriptionSchema = new mongoose.Schema(
  {
    usuario: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true },
    endpoint: { type: String, required: true, unique: true },
    p256dh: { type: String, required: true },
    auth: { type: String, required: true },
    // Metadatos de UA capturados al suscribirse (ver notificaciones.controller.js):
    // permiten mostrarle al usuario "Chrome en Windows" en vez de un endpoint
    // ilegible, y decidir cuál "olvidar" cuando tiene varios dispositivos.
    dispositivo: { type: String, trim: true, default: 'Desconocido' },
    navegador: { type: String, trim: true, default: 'Desconocido' },
    // 'expirada' se marca (en vez de borrar de inmediato) cuando el envío
    // falla con un error no concluyente; 404/410 del proveedor sí borra el
    // documento (ver notificaciones.service.js), porque esos códigos son
    // inequívocos: la suscripción ya no existe del lado del navegador.
    estado: { type: String, enum: ['activa', 'expirada'], default: 'activa' },
    ultimoUsoEn: { type: Date, default: Date.now },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: false } }
)

pushSubscriptionSchema.index({ usuario: 1, estado: 1 })

export default mongoose.model('PushSubscription', pushSubscriptionSchema)
