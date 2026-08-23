import mongoose from 'mongoose'

const passwordResetTokenSchema = new mongoose.Schema(
  {
    usuario: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true },
    token: { type: String, required: true, unique: true },
    expira_en: { type: Date, required: true },
    usado: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: 'creado_en', updatedAt: false } }
)

// Soporta el updateMany({usuario, usado:false}) de auth.controller.js
// (invalidar tokens previos al pedir uno nuevo) sin escanear la colección
// completa a medida que crece.
passwordResetTokenSchema.index({ usuario: 1 })

// TTL: Mongo borra el documento apenas se cumple `expira_en`, sin depender
// de que nadie corra un job de limpieza. No cambia el comportamiento visible
// del flujo de reset: validarToken()/restablecerPassword() (auth.controller.js)
// ya filtran `expira_en: {$gt: new Date()}` en cada consulta, así que un
// token que Mongo ya purgó por TTL da exactamente el mismo resultado
// ("inválido o expirado") que uno que sigue ahí pero vencido. Un token ya
// usado (`usado:true`) no actualiza `expira_en`, así que igual se limpia
// solo, dentro de la hora siguiente a su emisión.
passwordResetTokenSchema.index({ expira_en: 1 }, { expireAfterSeconds: 0 })

export default mongoose.model('PasswordResetToken', passwordResetTokenSchema)
