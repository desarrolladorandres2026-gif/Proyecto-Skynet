import nodemailer from 'nodemailer'
import { env } from '../config/env.js'

const transporter = nodemailer.createTransport({
  host: env.EMAIL_HOST,
  port: Number(env.EMAIL_PORT) || 587,
  secure: env.EMAIL_SECURE,
  auth: env.EMAIL_USER ? { user: env.EMAIL_USER, pass: env.EMAIL_PASS } : undefined,
})

// Nombre de remitente explícito: sin él, el cliente de correo muestra el
// nombre de perfil de la cuenta de Gmail usada como SMTP (p. ej. "sigittn"),
// no "Skynet" — confuso para quien lo recibe y además una señal más de
// remitente genérico/no confiable para los filtros antispam.
const REMITENTE = `"Skynet" <${env.EMAIL_USER}>`

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

export async function enviarEmailReset(destinatario, nombreUsuario, token) {
  const link = `${env.FRONTEND_URL}/reset-password?token=${token}`

  await transporter.sendMail({
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
