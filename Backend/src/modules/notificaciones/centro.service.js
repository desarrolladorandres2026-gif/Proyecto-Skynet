import Notificacion from '../../models/Notificacion.js'
import { ErrorNoEncontrado } from '../../utils/errores.js'

// Centro de notificaciones del usuario autenticado (campana). Todas las
// funciones reciben `usuarioId` explícito y SIEMPRE lo toman de
// req.usuario.id_usuario en el controller — nunca de query/body/params —
// para que un usuario jamás pueda leer ni marcar como leída la bandeja de
// otro pasando un id ajeno.

const LIMITE_MAX = 50
const LIMITE_DEFECTO = 20

export async function listarMisNotificaciones(usuarioId, { page, limit } = {}) {
  const paginaActual = Math.max(1, Number.parseInt(page, 10) || 1)
  const limite = Math.min(LIMITE_MAX, Math.max(1, Number.parseInt(limit, 10) || LIMITE_DEFECTO))
  const skip = (paginaActual - 1) * limite

  const filtro = { usuario: usuarioId }
  const [notificaciones, total] = await Promise.all([
    Notificacion.find(filtro).sort({ createdAt: -1 }).skip(skip).limit(limite),
    Notificacion.countDocuments(filtro),
  ])

  return { notificaciones, total, page: paginaActual, pages: Math.ceil(total / limite) || 1 }
}

export function contarNoLeidas(usuarioId) {
  return Notificacion.countDocuments({ usuario: usuarioId, leida: false })
}

// El filtro { _id, usuario: usuarioId } es la única línea de defensa real:
// si el _id existe pero pertenece a otro usuario, findOneAndUpdate no
// encuentra nada y esto lanza 404 — no un 403 que confirmaría que el id
// existe, ni una actualización silenciosa de un documento ajeno.
export async function marcarLeida(id, usuarioId) {
  const resultado = await Notificacion.findOneAndUpdate(
    { _id: id, usuario: usuarioId },
    { $set: { leida: true, leidaEn: new Date() } },
    { new: true }
  )
  if (!resultado) throw new ErrorNoEncontrado('Notificación no encontrada')
  return resultado
}

export async function marcarTodasLeidas(usuarioId) {
  const { modifiedCount } = await Notificacion.updateMany(
    { usuario: usuarioId, leida: false },
    { $set: { leida: true, leidaEn: new Date() } }
  )
  return { actualizadas: modifiedCount }
}
