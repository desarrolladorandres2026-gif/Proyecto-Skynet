import mongoose from 'mongoose'

// Una cuenta de correo conectada por un usuario de Skynet. Nunca guarda una
// contraseña: solo el refresh token OAuth, cifrado (ver utils/cifrado.js).
// Un usuario tiene a lo sumo una cuenta de email conectada a la vez (índice
// único en `usuario`) — conectar una nueva reemplaza la anterior.
const emailCuentaSchema = new mongoose.Schema(
  {
    usuario: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true, unique: true },
    proveedor: { type: String, enum: ['gmail'], required: true },
    correo: { type: String, required: true, trim: true, lowercase: true },
    refreshTokenCifrado: { type: String, required: true },
  },
  { timestamps: true }
)

export default mongoose.model('EmailCuenta', emailCuentaSchema)
