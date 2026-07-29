import nodemailer from 'nodemailer'
import { env } from '../config/env.js'

const transporter = nodemailer.createTransport({
  host: env.EMAIL_HOST,
  port: Number(env.EMAIL_PORT) || 587,
  secure: env.EMAIL_SECURE,
  auth: env.EMAIL_USER ? { user: env.EMAIL_USER, pass: env.EMAIL_PASS } : undefined,
})

export async function enviarEmailReset(destinatario, nombreUsuario, token) {
  const link = `${env.FRONTEND_URL}/reset-password?token=${token}`

  await transporter.sendMail({
    from: env.EMAIL_USER,
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
