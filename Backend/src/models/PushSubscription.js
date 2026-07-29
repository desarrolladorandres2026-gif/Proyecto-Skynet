import mongoose from 'mongoose'

const pushSubscriptionSchema = new mongoose.Schema(
  {
    usuario: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true },
    endpoint: { type: String, required: true, unique: true },
    p256dh: { type: String, required: true },
    auth: { type: String, required: true },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: false } }
)

export default mongoose.model('PushSubscription', pushSubscriptionSchema)
