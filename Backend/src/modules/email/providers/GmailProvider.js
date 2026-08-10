import { google } from 'googleapis'
import { env } from '../../../config/env.js'
import { descifrar } from '../../../utils/cifrado.js'
import { EmailProvider } from './EmailProvider.js'

// gmail.modify cubre leer, buscar, enviar, archivar y mover a papelera (NO
// cubre borrado permanente — "eliminar" en este proveedor mueve a la
// papelera de Gmail, nunca purga). userinfo.email es aparte: sin él,
// oauth2.userinfo.get() en conectarGmailCallback (email.service.js) falla
// con "Request is missing required authentication credential" — el token
// de gmail.modify por sí solo no autoriza leer el perfil del usuario.
export const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/userinfo.email',
]

export function clienteOAuth() {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    throw new Error('Gmail no está configurado en el servidor: faltan GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET')
  }
  return new google.auth.OAuth2(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, env.GOOGLE_REDIRECT_URI)
}

const CARPETA_A_LABEL = {
  entrada: 'INBOX',
  importantes: 'IMPORTANT',
  enviados: 'SENT',
  borradores: 'DRAFT',
  papelera: 'TRASH',
}

function decodificarCuerpo(payload) {
  const parte =
    payload?.parts?.find((p) => p.mimeType === 'text/plain') ||
    payload?.parts?.find((p) => p.mimeType === 'text/html') ||
    payload
  const data = parte?.body?.data
  if (!data) return ''
  return Buffer.from(data, 'base64url').toString('utf8')
}

function cabecera(headers, nombre) {
  return headers?.find((h) => h.name.toLowerCase() === nombre.toLowerCase())?.value || ''
}

function aResumen(mensaje) {
  const headers = mensaje.payload?.headers
  return {
    id: mensaje.id,
    de: cabecera(headers, 'From'),
    asunto: cabecera(headers, 'Subject') || '(sin asunto)',
    resumen: mensaje.snippet || '',
    fecha: cabecera(headers, 'Date'),
    leido: !mensaje.labelIds?.includes('UNREAD'),
    importante: !!mensaje.labelIds?.includes('IMPORTANT'),
  }
}

export class GmailProvider extends EmailProvider {
  // cuenta: documento EmailCuenta (con refreshTokenCifrado y correo)
  constructor(cuenta) {
    super()
    this.cuenta = cuenta
  }

  #gmail() {
    const auth = clienteOAuth()
    auth.setCredentials({ refresh_token: descifrar(this.cuenta.refreshTokenCifrado) })
    return google.gmail({ version: 'v1', auth })
  }

  async estadoConexion() {
    return { conectada: true, cuenta: this.cuenta.correo, proveedor: 'gmail' }
  }

  async listar({ carpeta = 'entrada', limite = 50 }) {
    const gmail = this.#gmail()
    const label = CARPETA_A_LABEL[carpeta] || 'INBOX'
    const { data } = await gmail.users.messages.list({ userId: 'me', labelIds: [label], maxResults: limite })
    return this.#hidratar(gmail, data.messages || [])
  }

  async buscar({ query, limite = 50 }) {
    const gmail = this.#gmail()
    const { data } = await gmail.users.messages.list({ userId: 'me', q: query, maxResults: limite })
    return this.#hidratar(gmail, data.messages || [])
  }

  async #hidratar(gmail, referencias) {
    const mensajes = await Promise.all(
      referencias.map((ref) =>
        gmail.users.messages
          .get({ userId: 'me', id: ref.id, format: 'metadata', metadataHeaders: ['From', 'Subject', 'Date'] })
          .then((r) => aResumen(r.data))
      )
    )
    return mensajes
  }

  async obtener(id) {
    const gmail = this.#gmail()
    const { data } = await gmail.users.messages.get({ userId: 'me', id, format: 'full' })
    return { ...aResumen(data), cuerpo: decodificarCuerpo(data.payload) }
  }

  async enviar({ destinatario, asunto, cuerpo, enRespuestaA }) {
    // Un salto de línea dentro de "destinatario" o "asunto" inyectaría
    // cabeceras MIME arbitrarias (CC/Bcc falsos, otro Subject, etc.) en el
    // mensaje crudo de abajo — se rechaza antes de interpolar, no se intenta
    // sanear/escapar.
    for (const [campo, valor] of [['destinatario', destinatario], ['asunto', asunto]]) {
      if (/[\r\n]/.test(valor ?? '')) {
        throw new Error(`El campo "${campo}" no puede contener saltos de línea`)
      }
    }
    const gmail = this.#gmail()
    const crudo = [`To: ${destinatario}`, `Subject: ${asunto}`, 'Content-Type: text/plain; charset=utf-8', '', cuerpo].join('\r\n')
    const raw = Buffer.from(crudo).toString('base64url')
    const { data } = await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw, threadId: enRespuestaA || undefined },
    })
    return { id: data.id }
  }

  async marcarLeido(id, leido = true) {
    const gmail = this.#gmail()
    await gmail.users.messages.modify({
      userId: 'me',
      id,
      requestBody: leido ? { removeLabelIds: ['UNREAD'] } : { addLabelIds: ['UNREAD'] },
    })
  }

  async archivar(id) {
    const gmail = this.#gmail()
    await gmail.users.messages.modify({ userId: 'me', id, requestBody: { removeLabelIds: ['INBOX'] } })
  }

  // Mueve a la papelera de Gmail (reversible desde ahí), nunca purga
  // permanentemente — coherente con el gate de confirmación del punto 7 de
  // la especificación del módulo.
  async eliminar(id) {
    const gmail = this.#gmail()
    await gmail.users.messages.trash({ userId: 'me', id })
  }
}
