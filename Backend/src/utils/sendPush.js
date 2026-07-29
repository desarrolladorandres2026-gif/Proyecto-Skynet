import webpush from './webpush.js'
import PushSubscription from '../models/PushSubscription.js'
import Usuario from '../models/Usuario.js'

export async function notificarUsuarios(userIds, payload) {
  const idsUnicos = [...new Set(userIds.map(String))]
  if (!idsUnicos.length) return

  const suscripciones = await PushSubscription.find({ usuario: { $in: idsUnicos } })

  await Promise.allSettled(
    suscripciones.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload)
        )
      } catch (err) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          await PushSubscription.deleteOne({ _id: sub._id })
        } else {
          // Cualquier otro fallo (VAPID mal configurado, red, payload inválido)
          // debe quedar registrado: si no, las notificaciones pueden fallar
          // en silencio de forma permanente sin que nadie lo note.
          console.error(`Error enviando push a suscripción ${sub._id}:`, err.message)
        }
      }
    })
  )
}

// 'admin' era un string en Usuario.rol antes de la migración a RBAC dinámico
// (ahora Usuario.rol es una referencia a Rol) — este filtro nunca matcheaba
// nada desde entonces, así que ninguna push de SIGITTN llegaba a nadie. El
// "personal de TI" que debe recibirlas es quien tiene el flag legado
// Usuario.modulos.sigittn (mismo criterio que accesoTicket.js/esStaffSigittn;
// no incluye Super Admin aquí porque esa consulta viviría en Rol, no en
// Usuario, y quedarse sin la push no le bloquea nada — solo deja de avisarle).
export async function getAdminIds() {
  const admins = await Usuario.find({ modulos: 'sigittn', estado: 'activo' }).select('_id')
  return admins.map((u) => u._id)
}
