import { env } from '../../config/env.js'
import PushSubscription from '../../models/PushSubscription.js'
import PreferenciaNotificacion from '../../models/PreferenciaNotificacion.js'
import { CATEGORIAS_NOTIFICACION, esCategoriaValida } from './notificaciones.catalogo.js'
import { verificarTokenBaja } from './notificaciones.token.js'
import { paginaConfirmacionBaja } from './notificaciones.plantillas.js'

// Reconocimiento de UA deliberadamente simple (regex, sin librería nueva):
// esto solo alimenta una etiqueta cosmética ("Chrome en Windows") en la
// lista de dispositivos — no gobierna ninguna decisión de seguridad ni de
// negocio, así que no vale la pena una dependencia de parsing completa.
function describirDispositivo(userAgent = '') {
  const ua = userAgent
  let navegador = 'Navegador'
  if (/edg\//i.test(ua)) navegador = 'Edge'
  else if (/opr\/|opera/i.test(ua)) navegador = 'Opera'
  else if (/chrome\//i.test(ua)) navegador = 'Chrome'
  else if (/firefox\//i.test(ua)) navegador = 'Firefox'
  else if (/safari\//i.test(ua)) navegador = 'Safari'

  let dispositivo = 'Escritorio'
  if (/iphone|ipad|ipod/i.test(ua)) dispositivo = 'iOS'
  else if (/android/i.test(ua)) dispositivo = 'Android'
  else if (/windows/i.test(ua)) dispositivo = 'Windows'
  else if (/macintosh|mac os/i.test(ua)) dispositivo = 'macOS'
  else if (/linux/i.test(ua)) dispositivo = 'Linux'

  return { navegador, dispositivo }
}

export function getVapidPublicKey(_req, res) {
  res.json({ publicKey: env.VAPID_PUBLIC_KEY || null })
}

// El endpoint lo manda el navegador del usuario (Push API) y nunca debería
// apuntar a otro sitio: enviarPush() más adelante hace un POST real a
// `sub.endpoint` (ver notificaciones.service.js), reintentado varias veces
// por el worker. Sin esta lista blanca, cualquier usuario autenticado podría
// registrar una URL propia o interna (localhost, IP del VPS, metadata de la
// nube) y convertir al servidor en un proxy SSRF que reintenta solo.
const HOSTS_PUSH_EXACTOS = new Set([
  'fcm.googleapis.com', // Chrome, Edge, Opera y demás navegadores Chromium
  'updates.push.services.mozilla.com', // Firefox
  'web.push.apple.com', // Safari
])
const SUFIJOS_PUSH_PERMITIDOS = ['.notify.windows.com'] // WNS (Edge legado)

function endpointPushEsValido(endpoint) {
  let url
  try {
    url = new URL(endpoint)
  } catch {
    return false
  }
  if (url.protocol !== 'https:') return false
  const host = url.hostname.toLowerCase()
  return HOSTS_PUSH_EXACTOS.has(host) || SUFIJOS_PUSH_PERMITIDOS.some((sufijo) => host.endsWith(sufijo))
}

export async function suscribirPush(req, res) {
  const { endpoint, keys } = req.body
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return res.status(400).json({ error: 'endpoint, keys.p256dh y keys.auth son obligatorios' })
  }
  if (typeof endpoint !== 'string' || !endpointPushEsValido(endpoint)) {
    return res.status(400).json({ error: 'El endpoint no corresponde a un servicio de notificaciones push reconocido' })
  }

  const { navegador, dispositivo } = describirDispositivo(req.headers['user-agent'])

  await PushSubscription.findOneAndUpdate(
    { endpoint },
    {
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      usuario: req.usuario.id_usuario,
      navegador,
      dispositivo,
      estado: 'activa',
      ultimoUsoEn: new Date(),
    },
    { upsert: true }
  )

  res.status(201).json({ mensaje: 'Suscripción guardada' })
}

export async function desuscribirPush(req, res) {
  const { endpoint } = req.body
  await PushSubscription.deleteOne({ endpoint, usuario: req.usuario.id_usuario })
  res.json({ mensaje: 'Suscripción eliminada' })
}

export async function misDispositivos(req, res) {
  const dispositivos = await PushSubscription.find({ usuario: req.usuario.id_usuario })
    .select('dispositivo navegador estado ultimoUsoEn created_at')
    .sort({ ultimoUsoEn: -1 })
  res.json({ dispositivos })
}

export async function olvidarDispositivo(req, res) {
  const eliminado = await PushSubscription.findOneAndDelete({
    _id: req.params.id,
    usuario: req.usuario.id_usuario,
  })
  if (!eliminado) return res.status(404).json({ error: 'Dispositivo no encontrado' })
  res.json({ mensaje: 'Dispositivo olvidado' })
}

export function listarCategorias(_req, res) {
  res.json({ categorias: CATEGORIAS_NOTIFICACION })
}

export async function obtenerPreferencias(req, res) {
  const pref = await PreferenciaNotificacion.findOne({ usuario: req.usuario.id_usuario })
  res.json({
    email: { activo: pref ? pref.email.activo : true },
    push: { activo: pref ? pref.push.activo : true },
    categorias: Object.fromEntries(
      CATEGORIAS_NOTIFICACION.map((c) => [c.key, pref ? pref.categorias.get(c.key) !== false : true])
    ),
  })
}

export async function actualizarPreferencias(req, res) {
  const { email, push, categorias } = req.body

  const set = {}
  if (typeof email?.activo === 'boolean') set['email.activo'] = email.activo
  if (typeof push?.activo === 'boolean') set['push.activo'] = push.activo
  if (categorias && typeof categorias === 'object') {
    for (const [clave, valor] of Object.entries(categorias)) {
      if (!esCategoriaValida(clave)) {
        return res.status(400).json({ error: `Categoría desconocida: ${clave}` })
      }
      if (typeof valor !== 'boolean') {
        return res.status(400).json({ error: `El valor de "${clave}" debe ser booleano` })
      }
      set[`categorias.${clave}`] = valor
    }
  }

  const pref = await PreferenciaNotificacion.findOneAndUpdate(
    { usuario: req.usuario.id_usuario },
    { $set: set },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  )

  res.json({
    email: { activo: pref.email.activo },
    push: { activo: pref.push.activo },
    categorias: Object.fromEntries(
      CATEGORIAS_NOTIFICACION.map((c) => [c.key, pref.categorias.get(c.key) !== false])
    ),
  })
}

// Pública, sin sesión: se abre desde el enlace de un correo. El token
// prueba de quién es sin necesitar cookie de sesión (ver
// notificaciones.token.js) — por diseño solo puede desactivar el correo NO
// crítico, nunca los transaccionales (esos ni siquiera consultan
// PreferenciaNotificacion, ver notificaciones.service.js).
export async function darDeBajaEmail(req, res) {
  // GET: el usuario hizo clic en el enlace del correo (token en la query).
  // POST: one-click de Gmail/Outlook (RFC 8058) — el cliente de correo pega
  // en esta misma URL sin abrir navegador, así que responde texto plano en
  // vez de la página de confirmación.
  const token = req.query.token || req.body?.token
  let usuarioId
  try {
    usuarioId = verificarTokenBaja(token)
  } catch {
    return res.status(400).send('Enlace inválido o vencido.')
  }

  await PreferenciaNotificacion.findOneAndUpdate(
    { usuario: usuarioId },
    { $set: { 'email.activo': false } },
    { upsert: true, setDefaultsOnInsert: true }
  )

  if (req.method === 'POST') return res.json({ mensaje: 'Baja registrada' })
  res.set('Content-Type', 'text/html').send(paginaConfirmacionBaja())
}
