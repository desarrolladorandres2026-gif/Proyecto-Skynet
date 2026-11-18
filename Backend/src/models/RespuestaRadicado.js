import mongoose from 'mongoose'

// Constancia, dentro de Skynet, de cada respuesta oficial dada a un radicado
// del sitio web: quién respondió, cuándo, qué dijo y si el correo con la
// respuesta llegó a salir hacia quien hizo la petición.
//
// La respuesta "pública" vive en WordPress (tabla skynet_respuestas) y allá
// se puede borrar junto con el radicado; esta colección es el respaldo propio
// y el único lugar donde queda el estado del envío por correo. Todo se
// desnormaliza a propósito (nombre, texto, adjunto): la constancia debe seguir
// siendo legible aunque el usuario o el radicado ya no existan.
const respuestaRadicadoSchema = new mongoose.Schema(
  {
    radicadoId: { type: Number, required: true, index: true }, // id en WordPress
    radicado: { type: String, trim: true }, // consecutivo TTN-AAAA-NNNN
    wpRespuestaId: { type: Number }, // id de la respuesta en la tabla de WordPress

    nota: { type: String, default: '' },
    archivo: {
      nombre: { type: String },
      url: { type: String },
      tamano: { type: Number }, // bytes
      sha256: { type: String }, // huella del PDF tal como se publicó y adjuntó
    },

    respondidoPor: {
      usuario: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' },
      nombreUsuario: { type: String },
      nombre: { type: String },
    },
    ip: { type: String, trim: true },

    correo: {
      destinatario: { type: String, trim: true, lowercase: true },
      // sin_correo: el radicado no trae un correo válido del solicitante.
      // no_enviado: quien respondió decidió no mandar el correo (se puede enviar después).
      estado: { type: String, enum: ['enviado', 'fallido', 'sin_correo', 'no_enviado'], required: true },
      enviadoEn: { type: Date }, // último envío exitoso
      intentos: { type: Number, default: 0 },
      error: { type: String },
      messageId: { type: String },
      adjuntoIncluido: { type: Boolean, default: false },
    },
  },
  { timestamps: { createdAt: 'creadoEn', updatedAt: 'actualizadoEn' } },
)

respuestaRadicadoSchema.index({ radicadoId: 1, creadoEn: 1 })
respuestaRadicadoSchema.index({ radicadoId: 1, wpRespuestaId: 1 })

export default mongoose.model('RespuestaRadicado', respuestaRadicadoSchema)
