import Ticket from '../../models/sigittn/Ticket.js'
import { notificarUsuarios, getAdminIds } from '../../utils/sendPush.js'
import { tieneAcceso, esStaffSigittn } from './accesoTicket.js'

export async function listarMensajes(req, res) {
  const ticket = await Ticket.findById(req.params.id).populate('mensajes.usuario', 'nombre_usuario nombre')
  if (!ticket) return res.status(404).json({ error: 'Ticket no encontrado' })
  if (!tieneAcceso(ticket, req.usuario)) return res.status(403).json({ error: 'Sin acceso a este ticket' })

  res.json({ mensajes: ticket.mensajes })
}

export async function crearMensaje(req, res) {
  const { texto_mensaje, url_imagen_mensaje } = req.body
  if (!texto_mensaje && !url_imagen_mensaje) {
    return res.status(400).json({ error: 'texto_mensaje o url_imagen_mensaje es obligatorio' })
  }

  const ticket = await Ticket.findById(req.params.id)
  if (!ticket) return res.status(404).json({ error: 'Ticket no encontrado' })
  if (!tieneAcceso(ticket, req.usuario)) return res.status(403).json({ error: 'Sin acceso a este ticket' })

  ticket.mensajes.push({
    texto_mensaje,
    url_imagen_mensaje,
    usuario: req.usuario.id_usuario,
  })
  await ticket.save()

  const mensajeNuevo = ticket.mensajes[ticket.mensajes.length - 1]

  setTimeout(async () => {
    try {
      const adminIds = await getAdminIds()
      const destinatarios = new Set([
        ...adminIds.map(String),
        String(ticket.usuario_creador),
        ...(ticket.usuario_asignado ? [String(ticket.usuario_asignado)] : []),
      ])
      destinatarios.delete(String(req.usuario.id_usuario))

      const preview = texto_mensaje ? texto_mensaje.slice(0, 60) : '📷 Imagen adjunta'

      await notificarUsuarios([...destinatarios], {
        title: `Novedad en ticket: ${ticket.titulo_ticket}`,
        body: preview,
        url: `/tickets/${ticket._id}`,
        tag: `ticket-${ticket._id}`,
      })
    } catch (err) {
      console.error('Error enviando push:', err.message)
    }
  }, 0)

  res.status(201).json({ mensaje: mensajeNuevo })
}

export async function marcarLeido(req, res) {
  const ticket = await Ticket.findById(req.params.id)
  if (!ticket) return res.status(404).json({ error: 'Ticket no encontrado' })
  if (!tieneAcceso(ticket, req.usuario)) return res.status(403).json({ error: 'Sin acceso a este ticket' })

  const mensaje = ticket.mensajes.id(req.params.idMensaje)
  if (!mensaje) return res.status(404).json({ error: 'Mensaje no encontrado' })

  mensaje.leido_mensaje = true
  await ticket.save()
  res.json({ mensaje })
}

export async function marcarTodosLeidos(req, res) {
  const ticket = await Ticket.findById(req.params.id)
  if (!ticket) return res.status(404).json({ error: 'Ticket no encontrado' })

  const idUsuario = req.usuario.id_usuario
  const entrada = ticket.ultimo_visto.find((v) => String(v.usuario) === String(idUsuario))

  if (entrada) {
    entrada.visto_en = new Date()
  } else {
    ticket.ultimo_visto.push({ usuario: idUsuario, visto_en: new Date() })
  }

  await ticket.save()
  res.json({ mensaje: 'Marcado como leído' })
}

export async function noLeidos(req, res) {
  const idUsuario = req.usuario.id_usuario
  const esAdmin = esStaffSigittn(req.usuario)

  const filtro = esAdmin
    ? {}
    : { $or: [{ usuario_creador: idUsuario }, { usuario_asignado: idUsuario }] }

  const tickets = await Ticket.find(filtro).select('mensajes ultimo_visto')

  const idsConPendientes = tickets
    .filter((ticket) => {
      const visto = ticket.ultimo_visto.find((v) => String(v.usuario) === String(idUsuario))
      const vistoEn = visto?.visto_en || new Date(0)
      return ticket.mensajes.some(
        (m) => String(m.usuario) !== String(idUsuario) && m.fecha_mensaje > vistoEn
      )
    })
    .map((t) => t._id)

  res.json({ tickets: idsConPendientes })
}
