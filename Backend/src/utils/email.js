import nodemailer from 'nodemailer'
import { env } from '../config/env.js'
import { correoConexionCuenta } from './emailPlantillasTransaccionales.js'

const transporter = nodemailer.createTransport({
  host: env.EMAIL_HOST,
  port: Number(env.EMAIL_PORT) || 587,
  secure: env.EMAIL_SECURE,
  auth: env.EMAIL_USER ? { user: env.EMAIL_USER, pass: env.EMAIL_PASS } : undefined,
})

const dormir = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// Reintenta un envío SMTP con backoff exponencial (1s, 2s, 4s). Solo para
// correos que se mandan inmediatamente fuera de la cola de notificaciones
// (ver comentario de enviarEmailGenerico): esos ya tienen su propio
// reintento vía notificaciones.service.js#calcularProximoIntento en el
// siguiente tick del worker, pero un correo de reset de contraseña o de
// aprobación de conexión no puede esperar minutos a ese tick — o se
// reintenta ya mismo, en la misma petición, o el enlace pierde sentido.
async function enviarConReintentos(datosCorreo, intentos = 3) {
  let ultimoError
  for (let intento = 1; intento <= intentos; intento++) {
    try {
      return await transporter.sendMail(datosCorreo)
    } catch (err) {
      ultimoError = err
      console.error(`Fallo al enviar correo (intento ${intento}/${intentos}):`, err.message)
      if (intento < intentos) await dormir(2 ** (intento - 1) * 1000)
    }
  }
  throw ultimoError
}

// Nombre de remitente explícito: sin él, el cliente de correo muestra el
// nombre de perfil de la cuenta de Gmail usada como SMTP (p. ej. "sigittn"),
// no "Skynet" — confuso para quien lo recibe y además una señal más de
// remitente genérico/no confiable para los filtros antispam.
const REMITENTE = `"Skynet" <${env.EMAIL_FROM}>`

// Punto de entrada genérico usado por notificaciones.service.js (y por
// cualquier flujo transaccional futuro que necesite mandar un correo con
// HTML propio). enviarEmailReset(), abajo, se deja tal cual porque su envío
// es inmediato/no pasa por la cola — un enlace de recuperación de contraseña
// no debe esperar al siguiente tick del worker.
//
// `text` (alternativa en texto plano) y `headers` (List-Unsubscribe, ver
// notificaciones.plantillas.js) son opcionales pero importantes para
// entregabilidad: un correo que es solo HTML, sin cabeceras de baja y con
// remitente sin nombre, es exactamente el patrón que los filtros de spam
// penalizan — no hay forma de arreglar esto solo con el diseño visual.
export async function enviarEmailGenerico({ to, subject, html, text, headers }) {
  await transporter.sendMail({ from: REMITENTE, to, subject, html, text, headers })
}

// Alerta de seguridad enviada a Usuario.email (la cuenta REGISTRADA en
// Skynet, no la que se está conectando) cuando alguien hace clic en
// "Conectar" en el módulo Email. Envío inmediato con reintentos (ver
// enviarConReintentos): aprobar/denegar es sensible al tiempo — el enlace
// vence en minutos, así que un fallo transitorio de SMTP no puede quedar en
// silencio hasta el próximo tick de una cola.
const SCOPE_GMAIL = 'Leer, buscar, enviar y archivar/mover a papelera correos en tu nombre'

export async function enviarEmailConexionGmail(destinatario, nombreUsuario, { aprobarLink, denegarLink, ip, userAgent }) {
  await enviarConReintentos({
    from: REMITENTE,
    to: destinatario,
    subject: '⚠ Intento de conexión de Gmail en Skynet',
    html: correoConexionCuenta({
      nombreUsuario,
      proveedor: 'Gmail',
      aprobarLink,
      denegarLink,
      ip,
      userAgent,
      scopeDescripcion: SCOPE_GMAIL,
    }),
    text: `Alguien intentó conectar una cuenta de Gmail en Skynet (IP: ${ip || 'desconocida'}, dispositivo: ${userAgent || 'desconocido'}).\nAprobar: ${aprobarLink}\nDenegar: ${denegarLink}\nSi no fuiste tú, deniega y cambia tu contraseña.`,
  })
}

export async function enviarEmailReset(destinatario, nombreUsuario, token) {
  const link = `${env.FRONTEND_URL}/reset-password?token=${token}`

  await enviarConReintentos({
    from: REMITENTE,
    to: destinatario,
    subject: 'Restablecimiento de contraseña',
    html: `
      <p>Hola ${nombreUsuario},</p>
      <p>Solicitaste restablecer tu contraseña. Haz clic en el siguiente enlace (válido por 1 hora):</p>
      <p><a href="${link}">${link}</a></p>
      <p>Si no solicitaste esto, ignora este correo.</p>
    `,
  })
}
