import mongoose from 'mongoose'

// Interruptor MAESTRO y elección de canales por categoría a nivel de toda
// la plataforma — gobierna qué vías de transmisión (correo electrónico /
// dispositivo push) están habilitadas para cada tipo de evento antes de
// consultar las preferencias del usuario.
//
// Diseñado específicamente para controlar el volumen de correos enviados
// vía Resend y evitar exceder la cuota diaria en eventos de alta frecuencia.
//
// Colección de un solo documento (singleton): el servicio hace findOne({}) /
// findOneAndUpdate({}, ...), tratando "sin documento" como "ambos canales
// habilitados por defecto".
const canalCategoriaSchema = new mongoose.Schema(
  {
    email: { type: Boolean, default: true },
    push: { type: Boolean, default: true },
    activo: { type: Boolean, default: true },
  },
  { _id: false }
)

const configuracionCanalesNotificacionSchema = new mongoose.Schema(
  {
    emailGlobal: {
      activo: { type: Boolean, default: true },
    },
    pushGlobal: {
      activo: { type: Boolean, default: true },
    },
    canales: {
      type: Map,
      of: canalCategoriaSchema,
      default: {},
    },
  },
  { timestamps: true }
)

export default mongoose.model('ConfiguracionCanalesNotificacion', configuracionCanalesNotificacionSchema)
