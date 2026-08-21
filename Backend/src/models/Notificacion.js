import mongoose from 'mongoose'

// Canal interno del sistema de notificaciones (centro de notificaciones /
// campana): una fila por usuario por evento, independiente de todo lo demás.
//
// Deliberadamente separada de:
//   - EnvioNotificacion (cola+bitácora de push/email — no toca este archivo)
//   - AvisoIA (aviso proactivo que consume el widget del Copiloto, ver
//     modules/ia/ia.service.js) — se conserva sin cambios; el Copiloto puede
//     seguir usándola como una presentación adicional sobre este mismo
//     evento, pero esta colección YA NO depende de que exista.
//
// No requiere que el módulo 'ia' ni 'copiloto' estén activos, ni que Gemini
// esté disponible: la escribe notificar() directamente (ver
// notificaciones.service.js), en el mismo punto donde ya se resuelven
// destinatario y preferencia de categoría.
const notificacionSchema = new mongoose.Schema(
  {
    usuario: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true },
    // Igual criterio que EnvioNotificacion: categoria gobierna la preferencia
    // de categoría (PreferenciaNotificacion), tipo identifica el evento
    // puntual dentro de esa categoría para trazabilidad.
    categoria: { type: String, required: true, trim: true },
    tipo: { type: String, trim: true },
    titulo: { type: String, required: true, trim: true },
    cuerpo: { type: String, trim: true },
    // Ruta relativa del frontend a la que navega un clic sobre la
    // notificación (p. ej. "/requerimientos/<id>"). Opcional: no todo evento
    // tiene una pantalla concreta a la que llevar.
    url: { type: String, trim: true },
    leida: { type: Boolean, default: false },
    leidaEn: { type: Date },
  },
  { timestamps: true }
)

// El centro de notificaciones lista siempre por usuario + más reciente
// primero; el contador de no leídas filtra por usuario + leida:false — sin
// estos índices ambas consultas degradan a full collection scan a medida que
// crece la colección.
notificacionSchema.index({ usuario: 1, createdAt: -1 })
notificacionSchema.index({ usuario: 1, leida: 1 })

export default mongoose.model('Notificacion', notificacionSchema)
