import crypto from 'node:crypto'
import jwt from 'jsonwebtoken'
import { google } from 'googleapis'
import { env } from '../../config/env.js'
import EmailCuenta from '../../models/EmailCuenta.js'
import EmailConexionSolicitud from '../../models/EmailConexionSolicitud.js'
import Usuario from '../../models/Usuario.js'
import { registrarAuditoria } from '../../utils/auditoria.js'
import { cifrar } from '../../utils/cifrado.js'
import { enviarEmailConexionGmail } from '../../utils/email.js'
import { MockEmailProvider } from './providers/MockEmailProvider.js'
import { clienteOAuth, GMAIL_SCOPES, GmailProvider } from './providers/GmailProvider.js'

// Único punto donde se elige el proveedor activo, según la cuenta que el
// usuario tenga conectada (o MockEmailProvider si no conectó ninguna). El
// resto del módulo programa contra EmailProvider, así que agregar
// OutlookProvider/IMAPProvider más adelante solo toca esta función.
async function obtenerProvider(usuario) {
  const cuenta = await EmailCuenta.findOne({ usuario: usuario.id_usuario })
  if (cuenta?.proveedor === 'gmail') return new GmailProvider(cuenta)
  return new MockEmailProvider()
}

export async function estadoConexion(usuario) {
  return (await obtenerProvider(usuario)).estadoConexion()
}

export async function listar(usuario, { carpeta = 'entrada', limite = 50 } = {}) {
  return (await obtenerProvider(usuario)).listar({ carpeta, limite })
}

export async function buscar(usuario, { query, limite = 50 }) {
  if (!query?.trim()) return []
  return (await obtenerProvider(usuario)).buscar({ query: query.trim(), limite })
}

export async function obtener(usuario, id) {
  return (await obtenerProvider(usuario)).obtener(id)
}

// Acción sensible: enviar. El controller ya exige confirmar=true antes de
// llegar aquí (ver email.controller.js) — mismo principio que "¿Quieres que
// la envíe?" del punto 7 de la especificación, aplicado también a la API,
// no solo a la conversación con Skynet.
export async function enviar(usuario, mensaje) {
  const provider = await obtenerProvider(usuario)
  const resultado = await provider.enviar(mensaje)
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
  const provider = await obtenerProvider(usuario)
  await provider.eliminar(id)
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
  return (await obtenerProvider(usuario)).marcarLeido(id, leido)
}

export async function archivar(usuario, id) {
  const provider = await obtenerProvider(usuario)
  await provider.archivar(id)
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
  const token = crypto.randomBytes(32).toString('hex')
  const solicitud = await EmailConexionSolicitud.create({
    usuario: usuario.id_usuario,
    token,
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
    { token, estado: 'pendiente', expira_en: { $gt: new Date() } },
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
    { token, estado: 'pendiente' },
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
