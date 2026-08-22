import crypto from 'node:crypto'
import jwt from 'jsonwebtoken'
import { google } from 'googleapis'
import { env } from '../../config/env.js'
import EmailCuenta from '../../models/EmailCuenta.js'
import EmailConexionSolicitud from '../../models/EmailConexionSolicitud.js'
import Usuario from '../../models/Usuario.js'
import { registrarAuditoria } from '../../utils/auditoria.js'
import { cifrar } from '../../utils/cifrado.js'
import { hashToken } from '../../utils/tokens.js'
import { enviarEmailConexionGmail } from '../../utils/email.js'
import { ErrorAplicacion } from '../../utils/errores.js'
import { MockEmailProvider } from './providers/MockEmailProvider.js'
import { clienteOAuth, GMAIL_SCOPES, GmailProvider } from './providers/GmailProvider.js'

// Único punto donde se elige el proveedor activo, según la cuenta que el
// usuario tenga conectada (o MockEmailProvider si no conectó ninguna). El
// resto del módulo programa contra EmailProvider, así que agregar
// OutlookProvider/IMAPProvider más adelante solo toca esta función.
async function obtenerCuentaYProvider(usuario) {
  const cuenta = await EmailCuenta.findOne({ usuario: usuario.id_usuario })
  const provider = cuenta?.proveedor === 'gmail' ? new GmailProvider(cuenta) : new MockEmailProvider()
  return { cuenta, provider }
}

async function obtenerProvider(usuario) {
  return (await obtenerCuentaYProvider(usuario)).provider
}

// Google responde "invalid_grant" cuando el refresh token guardado ya no
// sirve (el dueño lo revocó en myaccount.google.com/permissions, una
// política de reautorización de Workspace lo venció, o cambió la
// contraseña). estadoConexion() nunca llama a Google — solo mira si hay
// una fila en Mongo — así que sin esto la UI se queda mostrando "Conectado"
// para siempre aunque cada operación real falle, y el error crudo de Gaxios
// (con su propio `status` 400) se le mostraba tal cual al usuario porque
// errorHandler.js expone el mensaje en cualquier status < 500. Al primer
// fallo real desconectamos la cuenta rota para que el estado se autocorrija
// y el usuario reciba un mensaje que sí explica qué hacer.
function esTokenInvalido(err) {
  return err?.response?.data?.error === 'invalid_grant' || /invalid_grant/i.test(err?.message || '')
}

async function conProvider(usuario, fn) {
  const { cuenta, provider } = await obtenerCuentaYProvider(usuario)
  try {
    return await fn(provider)
  } catch (err) {
    if (cuenta?.proveedor === 'gmail' && esTokenInvalido(err)) {
      await EmailCuenta.deleteOne({ _id: cuenta._id })
      await registrarAuditoria({
        usuario,
        accion: 'desconectar',
        modulo: 'email',
        entidad: 'EmailCuenta',
        entidadId: cuenta._id,
        descripcion: `Se desconectó automáticamente la cuenta de Gmail ${cuenta.correo}: Google rechazó el token (invalid_grant)`,
      })
      throw new ErrorAplicacion(
        `La conexión con Gmail (${cuenta.correo}) ya no es válida: Google revocó o venció el acceso. Ve a Configuración de Email y vuelve a conectarla.`
      )
    }
    throw err
  }
}

export async function estadoConexion(usuario) {
  return (await obtenerProvider(usuario)).estadoConexion()
}

export async function listar(usuario, { carpeta = 'entrada', limite = 50 } = {}) {
  return conProvider(usuario, (provider) => provider.listar({ carpeta, limite }))
}

export async function buscar(usuario, { query, limite = 50 }) {
  if (!query?.trim()) return []
  return conProvider(usuario, (provider) => provider.buscar({ query: query.trim(), limite }))
}

export async function obtener(usuario, id) {
  return conProvider(usuario, (provider) => provider.obtener(id))
}

// Acción sensible: enviar. El controller ya exige confirmar=true antes de
// llegar aquí (ver email.controller.js) — mismo principio que "¿Quieres que
// la envíe?" del punto 7 de la especificación, aplicado también a la API,
// no solo a la conversación con Skynet.
export async function enviar(usuario, mensaje) {
  const resultado = await conProvider(usuario, (provider) => provider.enviar(mensaje))
  await registrarAuditoria({
    usuario,
    accion: 'enviar',
    modulo: 'email',
    entidad: 'Email',
    entidadId: resultado?.id,
    descripcion: `Envió un correo a ${mensaje.destinatario}`,
  })
  return resultado
}

export async function eliminar(usuario, id) {
  await conProvider(usuario, (provider) => provider.eliminar(id))
  await registrarAuditoria({
    usuario,
    accion: 'eliminar',
    modulo: 'email',
    entidad: 'Email',
    entidadId: id,
    descripcion: 'Eliminó un correo',
  })
}

export async function marcarLeido(usuario, id, leido) {
  return conProvider(usuario, (provider) => provider.marcarLeido(id, leido))
}

export async function archivar(usuario, id) {
  await conProvider(usuario, (provider) => provider.archivar(id))
  await registrarAuditoria({
    usuario,
    accion: 'archivar',
    modulo: 'email',
    entidad: 'Email',
    entidadId: id,
    descripcion: 'Archivó un correo',
  })
}

// ── Conexión de Gmail, con aprobación fuera de banda por correo ─────────────
// Clic en "Conectar" NO manda directo a Google: primero crea una
// EmailConexionSolicitud (token plano de un solo uso, mismo patrón que
// PasswordResetToken) y manda una alerta a Usuario.email describiendo el
// intento (IP, dispositivo, qué se va a poder hacer). Solo si esa persona
// aprueba desde SU correo se genera la URL de consentimiento real de Google
// — así una sesión de Skynet robada no basta para enlazar una cuenta de
// Gmail sin que el dueño lo vea y lo autorice desde su bandeja de entrada.
//
// `state` (JWT de vida corta, `audience` propia para no confundirse con
// otros JWT de la app) ata el callback de Google a ESA solicitud aprobada
// específica, no a una sesión de navegador — el aprobar puede pasar en un
// dispositivo distinto al que hizo clic en "Conectar" (p. ej. el teléfono).
const SOLICITUD_TTL_MS = 15 * 60 * 1000
const STATE_TTL = '10m'
const STATE_AUDIENCE = 'oauth-state-email'

export async function solicitarConexionGmail(usuario, { ip, userAgent } = {}) {
  // El token en texto plano solo viaja en los enlaces de aprobar/denegar del
  // correo; en Mongo se guarda su hash (ver utils/tokens.js).
  const token = crypto.randomBytes(32).toString('hex')
  const solicitud = await EmailConexionSolicitud.create({
    usuario: usuario.id_usuario,
    token: hashToken(token),
    expira_en: new Date(Date.now() + SOLICITUD_TTL_MS),
    ip,
    userAgent,
  })

  const usuarioDb = await Usuario.findById(usuario.id_usuario).select('email nombre')
  if (usuarioDb?.email) {
    try {
      await enviarEmailConexionGmail(usuarioDb.email, usuarioDb.nombre, {
        aprobarLink: `${env.API_PUBLIC_URL}/email/oauth/gmail/aprobar?token=${token}`,
        denegarLink: `${env.API_PUBLIC_URL}/email/oauth/gmail/denegar?token=${token}`,
        ip,
        userAgent,
      })
    } catch (err) {
      console.error('No se pudo enviar el correo de conexión de Gmail:', err.message)
    }
  }

  await registrarAuditoria({
    usuario,
    accion: 'solicitar_conexion',
    modulo: 'email',
    entidad: 'EmailConexionSolicitud',
    entidadId: solicitud._id,
    descripcion: 'Solicitó conectar una cuenta de Gmail; se envió un correo de confirmación',
  })
}

// Transición atómica pendiente -> aprobada: findOneAndUpdate con el filtro de
// estado incluido hace que un segundo clic (o un reintento) sobre el mismo
// enlace ya no encuentre el documento y falle, en vez de regenerar la URL de
// Google dos veces para el mismo token.
export async function aprobarConexionGmail(token) {
  const solicitud = await EmailConexionSolicitud.findOneAndUpdate(
    { token: hashToken(token), estado: 'pendiente', expira_en: { $gt: new Date() } },
    { $set: { estado: 'aprobada' } },
    { new: true }
  )
  if (!solicitud) {
    throw new Error('El enlace de aprobación no es válido o ya venció. Vuelve a hacer clic en "Conectar" en Skynet.')
  }

  const auth = clienteOAuth()
  const state = jwt.sign({ id_solicitud: String(solicitud._id) }, env.JWT_SECRET, {
    expiresIn: STATE_TTL,
    audience: STATE_AUDIENCE,
  })
  return auth.generateAuthUrl({
    access_type: 'offline',
    // Fuerza que Google reemita un refresh_token incluso si el usuario ya
    // había autorizado antes (si no, en un segundo consentimiento Google no
    // lo reenvía y quedaríamos sin uno que guardar).
    prompt: 'consent',
    scope: GMAIL_SCOPES,
    state,
  })
}

export async function denegarConexionGmail(token) {
  const solicitud = await EmailConexionSolicitud.findOneAndUpdate(
    { token: hashToken(token), estado: 'pendiente' },
    { $set: { estado: 'denegada' } },
    { new: true }
  )
  if (!solicitud) return false

  await registrarAuditoria({
    usuario: { id_usuario: solicitud.usuario },
    accion: 'denegar_conexion',
    modulo: 'email',
    entidad: 'EmailConexionSolicitud',
    entidadId: solicitud._id,
    descripcion: 'Denegó desde el correo la conexión de la cuenta de Gmail',
  })
  return true
}

export async function conectarGmailCallback(code, state) {
  const { id_solicitud } = jwt.verify(state, env.JWT_SECRET, { audience: STATE_AUDIENCE })

  // aprobada -> usada, también atómico: si Google redirige dos veces (doble
  // clic, "atrás" del navegador) el segundo intento no vuelve a canjear el
  // mismo `code` ni a reemitir la cuenta.
  const solicitud = await EmailConexionSolicitud.findOneAndUpdate(
    { _id: id_solicitud, estado: 'aprobada' },
    { $set: { estado: 'usada' } },
    { new: true }
  )
  if (!solicitud) {
    throw new Error('La solicitud de conexión ya no es válida. Vuelve a hacer clic en "Conectar" en Skynet.')
  }

  const auth = clienteOAuth()
  const { tokens } = await auth.getToken(code)
  if (!tokens.refresh_token) {
    throw new Error('Google no devolvió un refresh token. Revoca el acceso previo en myaccount.google.com/permissions e inténtalo de nuevo.')
  }
  auth.setCredentials(tokens)
  const oauth2 = google.oauth2({ version: 'v2', auth })
  const { data: perfil } = await oauth2.userinfo.get()

  const cuenta = await EmailCuenta.findOneAndUpdate(
    { usuario: solicitud.usuario },
    { proveedor: 'gmail', correo: perfil.email, refreshTokenCifrado: cifrar(tokens.refresh_token) },
    { upsert: true, new: true }
  )

  const usuarioDb = await Usuario.findById(solicitud.usuario).select('nombre_usuario rol').populate('rol', 'slug')
  await registrarAuditoria({
    usuario: { id_usuario: solicitud.usuario, nombre_usuario: usuarioDb?.nombre_usuario, rol: usuarioDb?.rol },
    accion: 'conectar',
    modulo: 'email',
    entidad: 'EmailCuenta',
    entidadId: cuenta._id,
    descripcion: `Conectó la cuenta de Gmail ${perfil.email} (aprobado desde correo)`,
  })

  return cuenta
}

export async function desconectar(usuario) {
  const cuenta = await EmailCuenta.findOneAndDelete({ usuario: usuario.id_usuario })
  if (cuenta) {
    await registrarAuditoria({
      usuario,
      accion: 'desconectar',
      modulo: 'email',
      entidad: 'EmailCuenta',
      entidadId: cuenta._id,
      descripcion: `Desconectó la cuenta de ${cuenta.proveedor} ${cuenta.correo}`,
    })
  }
}
