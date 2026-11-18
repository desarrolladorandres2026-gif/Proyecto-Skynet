import { env } from '../../config/env.js'
import PushSubscription from '../../models/PushSubscription.js'
import EnvioNotificacion from '../../models/EnvioNotificacion.js'
import { registrarConexion } from '../../utils/streamNativo.js'
import { reenviarPendientesNativo } from '../avisos_terminal/avisos.service.js'
import PreferenciaNotificacion from '../../models/PreferenciaNotificacion.js'
import Usuario from '../../models/Usuario.js'
import { CATEGORIAS_NOTIFICACION, esCategoriaValida } from './notificaciones.catalogo.js'
import { verificarTokenBaja } from './notificaciones.token.js'
import { paginaConfirmacionBaja } from './notificaciones.plantillas.js'
import {
  obtenerConfiguracionCanales as _obtenerConfiguracionCanales,
  actualizarConfiguracionCanales as _actualizarConfiguracionCanales,
} from './notificaciones.service.js'

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

// App Android: registra el dispositivo (id generado por la app) para recibir
// notificaciones por la conexión SSE propia. Sin terceros.
export async function suscribirNativo(req, res) {
  const { dispositivoId, modelo } = req.body
  if (typeof dispositivoId !== 'string' || !/^[A-Za-z0-9-]{16,64}$/.test(dispositivoId)) {
    return res.status(400).json({ error: 'dispositivoId inválido' })
  }
  await PushSubscription.findOneAndUpdate(
    { endpoint: `nativo:${dispositivoId}` },
    {
      tipo: 'nativo',
      endpoint: `nativo:${dispositivoId}`,
      dispositivoId,
      usuario: req.usuario.id_usuario,
      navegador: 'App Android',
      dispositivo: typeof modelo === 'string' && modelo ? modelo.slice(0, 80) : 'Android',
      estado: 'activa',
      ultimoUsoEn: new Date(),
    },
    { upsert: true }
  )
  res.status(201).json({ mensaje: 'Dispositivo registrado' })
}

// Conexión larga (SSE). La app la abre desde su servicio en segundo plano con
// la cookie de sesión del WebView. Latido cada 25 s para que nginx / el
// operador móvil no cierren la conexión por inactividad.
export async function streamNativo(req, res) {
  const dispositivoId = String(req.query.dispositivo || '')
  const sub = await PushSubscription.findOne({
    endpoint: `nativo:${dispositivoId}`,
    usuario: req.usuario.id_usuario,
  })
  if (!sub) return res.status(404).json({ error: 'Dispositivo no registrado' })

  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  })
  req.socket.setTimeout(0) // server.timeout (30 s) no aplica a esta conexión larga
  res.flushHeaders()
  res.write('retry: 5000\n\n')

  const quitar = registrarConexion(String(req.usuario.id_usuario), dispositivoId, res)
  const latido = setInterval(() => res.write(': ping\n\n'), 25000)
  req.on('close', () => {
    clearInterval(latido)
    quitar()
  })

  // Lo que quedó esperando mientras estuvo desconectado se entrega ya.
  await EnvioNotificacion.updateMany(
    { pushSubscription: sub._id, estado: 'pendiente' },
    { $set: { proximoIntentoEn: new Date() } }
  )
  // Avisos Terminal de Neiva no pasan por EnvioNotificacion (ciclo propio,
  // ver avisos.service.js): se reenvían aparte los que aún no sonaron.
  reenviarPendientesNativo(req.usuario.id_usuario, dispositivoId).catch(() => {})
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

// Configuración administrativa de canales de notificación (Elección de notificaciones).
// Exclusivo de administración: permite controlar de forma global y por categoría qué
// eventos se transmiten por Email (Resend) y cuáles por Dispositivo (Push).
export async function obtenerCanalesAdmin(_req, res) {
  const config = await _obtenerConfiguracionCanales()
  res.json(config)
}

export async function actualizarCanalesAdmin(req, res) {
  const config = await _actualizarConfiguracionCanales(req.body)
  res.json(config)
}


// Quién SÍ y quién NO puede recibir push hoy. Una suscripción cuenta si no
// está 'expirada' (las migradas no traen `estado`, ver notificar()). Solo
// usuarios reales y activos: las cuentas de prueba no son "gente por avisar".
export async function coberturaPushAdmin(_req, res) {
  const [usuarios, suscritos] = await Promise.all([
    Usuario.find({ esPrueba: { $ne: true }, estado: { $ne: 'inactivo' } })
      .select('nombre cargo email')
      .sort({ nombre: 1 })
      .lean(),
    PushSubscription.distinct('usuario', { estado: { $ne: 'expirada' } }),
  ])
  const conPush = new Set(suscritos.map(String))
  const sinPush = usuarios
    .filter((u) => !conPush.has(String(u._id)))
    .map((u) => ({ id: u._id, nombre: u.nombre, cargo: u.cargo || '', email: u.email || '' }))
  res.json({ total: usuarios.length, conPush: usuarios.length - sinPush.length, sinPush })
}
