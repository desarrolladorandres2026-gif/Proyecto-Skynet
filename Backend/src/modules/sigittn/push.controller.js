import PushSubscription from '../../models/PushSubscription.js'
import { env } from '../../config/env.js'

export function getVapidPublicKey(_req, res) {
  res.json({ publicKey: env.VAPID_PUBLIC_KEY })
}

export async function suscribir(req, res) {
  const { endpoint, keys } = req.body
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return res.status(400).json({ error: 'endpoint, keys.p256dh y keys.auth son obligatorios' })
  }

  await PushSubscription.findOneAndUpdate(
    { endpoint },
    { endpoint, p256dh: keys.p256dh, auth: keys.auth, usuario: req.usuario.id_usuario },
    { upsert: true }
  )

  res.status(201).json({ mensaje: 'Suscripción guardada' })
}

export async function desuscribir(req, res) {
  const { endpoint } = req.body
  await PushSubscription.deleteOne({ endpoint, usuario: req.usuario.id_usuario })
  res.json({ mensaje: 'Suscripción eliminada' })
}
