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

export default mongoose.model('PasswordResetToken', passwordResetTokenSchema)
