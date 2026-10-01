import { fileURLToPath } from 'node:url'
import nodemailer from 'nodemailer'
import { env } from '../config/env.js'
import { CID_LOGO } from './emailDiseno.js'
import {
  correoConexionCuenta,
  correoConexionCuentaTexto,
  correoRestablecerPassword,
  correoRestablecerPasswordTexto,
} from './emailPlantillasTransaccionales.js'

const transporter = nodemailer.createTransport({
  host: env.EMAIL_HOST,
  port: Number(env.EMAIL_PORT) || 587,
  secure: env.EMAIL_SECURE,
  auth: env.EMAIL_USER ? { user: env.EMAIL_USER, pass: env.EMAIL_PASS } : undefined,
  // Sin esto, nodemailer usa sus defaults (2 min de conexión, 10 min de
  // socket): un SMTP lento o colgado deja la petición HTTP que originó el
  // envío (p. ej. solicitar-reset, que hace `await` sobre esto) esperando
  // minutos enteros antes de que enviarConReintentos() siquiera pueda
  // reintentar. Ver auditoría de producción 2026-08-22 (hallazgo señalado
  // por el agente de notificaciones, confirmado en la práctica por un
  // timeout real en tests/auth.flujo.test.js al mandar dos correos seguidos).
  connectionTimeout: 10_000,
  greetingTimeout: 10_000,
  socketTimeout: 15_000,
})

const dormir = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// Dominios reservados que no existen en Internet (RFC 2606/6761): en Mongo hay
// usuarios con direcciones así — los del seed (@skynet.local) y los de los
// tests (@example.com). Mandarles igual no le llega a nadie y sale caro: cada
// uno vuelve como rebote DURO, y la tasa de rebotes es de lo primero que miran
// Gmail/Outlook para decidir si TODO lo demás del mismo remitente va a spam
// (Resend además suspende la cuenta si pasa de ~4 %). El aviso de fin de
// mantenimiento del 2026-09-10 rebotó en cada una de las direcciones @skynet.local.
const TLDS_NO_ENTREGABLES = new Set(['local', 'localhost', 'test', 'invalid', 'example', 'internal'])
const DOMINIOS_NO_ENTREGABLES = new Set(['example.com', 'example.net', 'example.org'])

export function esDestinoNoEntregable(direccion) {
  const dominio = String(direccion ?? '').trim().toLowerCase().split('@').pop().replace(/\.$/, '')
  const etiquetas = dominio.split('.')
  return TLDS_NO_ENTREGABLES.has(etiquetas.at(-1)) || DOMINIOS_NO_ENTREGABLES.has(etiquetas.slice(-2).join('.'))
}

// `descartar: true` le dice a quien llama que reintentar no sirve (mismo
// contrato que una suscripción push muerta en notificaciones.service.js).
function exigirDestinoEntregable(direccion) {
  if (!esDestinoNoEntregable(direccion)) return
  throw Object.assign(new Error(`${direccion} no puede recibir correo: su dominio está reservado y no existe en Internet`), {
    descartar: true,
  })
}

// Reintenta un envío SMTP con backoff exponencial (1s, 2s, 4s). Solo para
// correos que se mandan inmediatamente fuera de la cola de notificaciones
// (ver comentario de enviarEmailGenerico): esos ya tienen su propio
// reintento vía notificaciones.service.js#calcularProximoIntento en el
// siguiente tick del worker, pero un correo de reset de contraseña o de
// aprobación de conexión no puede esperar minutos a ese tick — o se
// reintenta ya mismo, en la misma petición, o el enlace pierde sentido.
async function enviarConReintentos(datosCorreo, intentos = 3) {
  exigirDestinoEntregable(datosCorreo.to)
  let ultimoError
  for (let intento = 1; intento <= intentos; intento++) {
    try {
      return await transporter.sendMail(conLogo(datosCorreo))
    } catch (err) {
      ultimoError = err
      console.error(`Fallo al enviar correo (intento ${intento}/${intentos}):`, err.message)
      if (intento < intentos) await dormir(2 ** (intento - 1) * 1000)
    }
  }
  throw ultimoError
}

// Nombre de remitente explícito: sin él, el cliente de correo muestra el
// nombre de perfil de la cuenta usada como SMTP (p. ej. "sigittn" o
// "resend"), que para quien recibe es un remitente desconocido y para los
// filtros antispam una señal más de correo genérico.
//
// Es la institución la que remite, no el sistema: quien recibe el correo
// reconoce "El Terminal de Neiva", no el nombre interno de la plataforma.
// Ojo con lo que este valor NO puede cambiar: la DIRECCIÓN sigue siendo
// EMAIL_FROM (hoy notificaciones@skynetttn.online), y Gmail la muestra al
// lado del nombre. Para que tampoco aparezca ahí el dominio de la
// plataforma hay que verificar elterminalneiva.com en el proveedor SMTP
// (Resend: registros SPF/DKIM en el DNS del dominio) y solo entonces
// apuntar EMAIL_FROM allí — no es algo que se resuelva en el código.
const REMITENTE = `"El Terminal de Neiva" <${env.EMAIL_FROM}>`

// El logo de las plantillas (utils/emailDiseno.js) viaja adjunto e
// incrustado por CID en vez de enlazado a una URL: se ve igual en local que en
// producción y Outlook no lo bloquea como bloquea las imágenes remotas. Se
// adjunta solo si el HTML lo referencia, así que un correo que no use el
// diseño común no carga con él.
const LOGO = {
  filename: 'el-terminal-neiva.png',
  path: fileURLToPath(new URL('../assets/email/logo-el-terminal.png', import.meta.url)),
  cid: CID_LOGO,
}

function conLogo(datosCorreo) {
  if (!datosCorreo.html?.includes(`cid:${CID_LOGO}`)) return datosCorreo
  return { ...datosCorreo, attachments: [...(datosCorreo.attachments || []), LOGO] }
}

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
  exigirDestinoEntregable(to)
  await transporter.sendMail(conLogo({ from: REMITENTE, to, subject, html, text, headers }))
}

// Comprueba que el SMTP configurado acepta conexión y credenciales SIN
// enviar nada (transporter.verify() de nodemailer). Se usa como pre-flight
// antes de un envío masivo (ver despliegue.service.js del copiloto): así, si
// falta EMAIL_HOST/EMAIL_PASS o son inválidos, el Super Admin recibe un
// mensaje claro ANTES de que arranque un lote, en vez de descubrirlo a mitad
// de camino con una decena de fallos por destinatario que en realidad son un
// solo problema de configuración.
export async function verificarConfiguracionEmail() {
  await transporter.verify()
}

// Alerta de seguridad enviada a Usuario.email (la cuenta REGISTRADA en
// Skynet, no la que se está conectando) cuando alguien hace clic en
// "Conectar" en el módulo Email. Envío inmediato con reintentos (ver
// enviarConReintentos): aprobar/denegar es sensible al tiempo — el enlace
// vence en minutos, así que un fallo transitorio de SMTP no puede quedar en
// silencio hasta el próximo tick de una cola.
const SCOPE_GMAIL = 'Leer, buscar, enviar y archivar/mover a papelera correos en tu nombre'

export async function enviarEmailConexionGmail(destinatario, nombreUsuario, { aprobarLink, denegarLink, ip, userAgent }) {
  const datos = { nombreUsuario, proveedor: 'Gmail', aprobarLink, denegarLink, ip, userAgent, scopeDescripcion: SCOPE_GMAIL }
  await enviarConReintentos({
    from: REMITENTE,
    to: destinatario,
    subject: '⚠ Intento de conexión de Gmail',
    html: correoConexionCuenta(datos),
    text: correoConexionCuentaTexto(datos),
  })
}

// El token vence en 1 hora (ver auth.controller.js#solicitarReset).
export async function enviarEmailReset(destinatario, nombreUsuario, token) {
  const datos = { nombreUsuario, enlace: `${env.FRONTEND_URL}/reset-password?token=${token}`, ttlMinutos: 60 }
  await enviarConReintentos({
    from: REMITENTE,
    to: destinatario,
    subject: 'Restablecimiento de contraseña',
    html: correoRestablecerPassword(datos),
    text: correoRestablecerPasswordTexto(datos),
  })
}
