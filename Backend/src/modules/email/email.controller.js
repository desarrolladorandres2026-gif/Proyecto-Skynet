import { env } from '../../config/env.js'
import { paginaConexionDenegada, paginaConexionError } from './email.plantillas.js'
import * as service from './email.service.js'

export async function estado(req, res) {
  const conexion = await service.estadoConexion(req.usuario)
  res.json({ conexion })
}

export async function listar(req, res) {
  const mensajes = await service.listar(req.usuario, { carpeta: req.query.carpeta, limite: req.query.limite })
  res.json({ mensajes })
}

export async function buscar(req, res) {
  const mensajes = await service.buscar(req.usuario, { query: req.query.q, limite: req.query.limite })
  res.json({ mensajes })
}

export async function detalle(req, res) {
  const mensaje = await service.obtener(req.usuario, req.params.id)
  if (!mensaje) return res.status(404).json({ error: 'Correo no encontrado' })
  res.json({ mensaje })
}

// Requiere { ...mensaje, confirmar: true }: Skynet (y la UI) deben mostrarle
// primero el borrador al usuario y solo reenviar la petición con confirmar
// tras su aprobación explícita — ver punto 7 de la especificación del módulo.
export async function enviar(req, res) {
  if (!req.body.confirmar) {
    return res.status(400).json({ error: 'Falta confirmación explícita del usuario antes de enviar' })
  }
  const resultado = await service.enviar(req.usuario, req.body)
  res.status(201).json(resultado)
}

export async function eliminar(req, res) {
  await service.eliminar(req.usuario, req.params.id)
  res.status(204).send()
}

export async function marcarLeido(req, res) {
  await service.marcarLeido(req.usuario, req.params.id, req.body.leido !== false)
  res.json({ ok: true })
}

export async function archivar(req, res) {
  await service.archivar(req.usuario, req.params.id)
  res.json({ ok: true })
}

// No conecta nada todavía: solo dispara el correo de confirmación (ver
// solicitarConexionGmail) y manda de vuelta a la pantalla de configuración
// con un aviso de "revisa tu correo".
export async function iniciarConexionGmail(req, res) {
  await service.solicitarConexionGmail(req.usuario, { ip: req.ip, userAgent: req.get('user-agent') })
  res.redirect(`${env.FRONTEND_URL}/email/configuracion?email_pendiente=1`)
}

// Clic en el correo de alerta — público, sin cookie de sesión (puede venir
// de otro dispositivo). El token de un solo uso es la única autorización.
export async function aprobarConexionGmail(req, res) {
  const { token } = req.query
  if (typeof token !== 'string' || !token) return res.status(400).send('Enlace inválido.')
  try {
    const googleUrl = await service.aprobarConexionGmail(token)
    res.redirect(googleUrl)
  } catch (err) {
    res.status(400).set('Content-Type', 'text/html').send(paginaConexionError(err.message))
  }
}

export async function denegarConexionGmail(req, res) {
  const { token } = req.query
  if (typeof token !== 'string' || !token) return res.status(400).send('Enlace inválido.')
  const ok = await service.denegarConexionGmail(token)
  res
    .set('Content-Type', 'text/html')
    .send(ok ? paginaConexionDenegada() : paginaConexionError('El enlace ya no es válido o ya fue usado.'))
}

// Google redirige aquí en el mismo navegador que aprobó desde el correo (no
// necesariamente el que abrió "Conectar" en Skynet, ni tiene por qué tener
// cookie de sesión): la autorización la da por completo el `state` firmado
// en aprobarConexionGmail, atado a una EmailConexionSolicitud concreta y de
// un solo uso — ver conectarGmailCallback.
export async function callbackGmail(req, res) {
  const { code, state, error } = req.query
  const destino = `${env.FRONTEND_URL}/email/configuracion`
  if (error || !code || !state) {
    return res.redirect(`${destino}?email_error=${encodeURIComponent(error || 'conexion_cancelada')}`)
  }
  try {
    await service.conectarGmailCallback(code, state)
    res.redirect(`${destino}?email_conectado=1`)
  } catch (err) {
    res.redirect(`${destino}?email_error=${encodeURIComponent(err.message)}`)
  }
}

export async function desconectar(req, res) {
  await service.desconectar(req.usuario)
  res.json({ ok: true })
}
