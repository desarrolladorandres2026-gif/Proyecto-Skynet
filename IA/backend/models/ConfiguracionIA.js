import mongoose from 'mongoose'

// Interruptor MAESTRO por categoría, a nivel de toda la plataforma — lo que
// el Super Admin apaga aquí, ningún usuario lo puede prender desde
// PreferenciaIA (mismo principio de "el nivel global manda" que
// requiereModuloActivo sobre las preferencias personales de notificaciones).
// Colección de un solo documento: no hay `clave` ni `_id` fijo a propósito,
// el servicio siempre hace `findOne({})` / `findOneAndUpdate({}, ...)` sobre
// ella, igual que PreferenciaNotificacion trata "sin documento" como "todo
// activado" en vez de forzar una fila desde el arranque.
const configuracionIASchema = new mongoose.Schema(
  {
    categorias: {
      type: Map,
      of: Boolean,
      default: {},
    },
  },
  { timestamps: true }
)

export default mongoose.model('ConfiguracionIA', configuracionIASchema)
