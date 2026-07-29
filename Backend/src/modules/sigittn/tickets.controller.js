import Ticket from '../../models/sigittn/Ticket.js'
import Usuario from '../../models/Usuario.js'
import { notificarUsuarios, getAdminIds } from '../../utils/sendPush.js'
import { tieneAcceso, esStaffSigittn } from './accesoTicket.js'

const POPULATE_USUARIO = 'nombre_usuario nombre'

function conPopulate(query) {
  return query
    .populate('usuario_creador', POPULATE_USUARIO)
    .populate('usuario_asignado', POPULATE_USUARIO)
    .populate('mensajes.usuario', POPULATE_USUARIO)
}

export async function listarTickets(req, res) {
  const { id_modulo_origen, estados, id_usuario, page = 1, limit = 9 } = req.query

  const filtro = {}
  if (id_modulo_origen) filtro.modulo_origen = id_modulo_origen
  if (estados) filtro.estado = { $in: estados.split(',') }
  if (id_usuario) filtro.usuario_asignado = id_usuario

  const pageNum = Math.max(1, parseInt(page))
  const limitNum = parseInt(limit)

  const [tickets, total] = await Promise.all([
    conPopulate(Ticket.find(filtro))
      .sort({ fecha_creacion_ticket: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum),
    Ticket.countDocuments(filtro),
  ])

  res.json({ tickets, total, pages: Math.ceil(total / limitNum), page: pageNum })
}

export async function obtenerTicket(req, res) {
  const ticket = await conPopulate(Ticket.findById(req.params.id))
  if (!ticket) return res.status(404).json({ error: 'Ticket no encontrado' })
  if (!tieneAcceso(ticket, req.usuario)) return res.status(403).json({ error: 'Sin acceso a este ticket' })
  res.json({ ticket })
}

export async function crearTicket(req, res) {
  const { titulo_ticket, descripcion_ticket, id_modulo_origen, id_nivel_urgencia, id_usuario_asignado } = req.body

  if (!titulo_ticket || !id_modulo_origen || !id_nivel_urgencia) {
    return res.status(400).json({ error: 'titulo_ticket, id_modulo_origen y id_nivel_urgencia son obligatorios' })
  }

  const estado = id_usuario_asignado ? 'Asignado' : 'Nuevo'

  const ticket = await Ticket.create({
    titulo_ticket,
    descripcion_ticket: descripcion_ticket || '',
    modulo_origen: id_modulo_origen,
    nivel_urgencia: id_nivel_urgencia,
    estado,
    usuario_creador: req.usuario.id_usuario,
    usuario_asignado: id_usuario_asignado || undefined,
  })

  const adminIds = await getAdminIds()
  const creadorEsAdmin = adminIds.some((id) => String(id) === String(req.usuario.id_usuario))
  const destinatarios = new Set(adminIds.map(String))
  destinatarios.delete(String(req.usuario.id_usuario))

  if (id_usuario_asignado && String(id_usuario_asignado) !== String(req.usuario.id_usuario)) {
    const asignadoEsAdmin = adminIds.some((id) => String(id) === String(id_usuario_asignado))
    if (!asignadoEsAdmin) destinatarios.add(String(id_usuario_asignado))
  }

  setTimeout(() => {
    notificarUsuarios([...destinatarios], {
      title: 'Nuevo ticket',
      body: titulo_ticket,
      url: `/tickets/${ticket._id}`,
      tag: `ticket-${ticket._id}`,
    }).catch((err) => console.error('Error enviando push:', err.message))
  }, 0)

  const ticketCompleto = await conPopulate(Ticket.findById(ticket._id))
  res.status(201).json({ ticket: ticketCompleto })
}

export async function actualizarTicket(req, res) {
  const ticket = await Ticket.findById(req.params.id)
  if (!ticket) return res.status(404).json({ error: 'Ticket no encontrado' })
  if (!tieneAcceso(ticket, req.usuario)) return res.status(403).json({ error: 'Sin acceso a este ticket' })

  const body = req.body
  const esAdmin = esStaffSigittn(req.usuario)
  const asignadoAnterior = ticket.usuario_asignado?.toString()

  if (body.titulo_ticket !== undefined) ticket.titulo_ticket = body.titulo_ticket
  if (body.descripcion_ticket !== undefined) ticket.descripcion_ticket = body.descripcion_ticket
  if (body.id_modulo_origen !== undefined) ticket.modulo_origen = body.id_modulo_origen
  if (body.id_nivel_urgencia !== undefined) ticket.nivel_urgencia = body.id_nivel_urgencia
  if (esAdmin && body.id_usuario_asignado !== undefined) {
    ticket.usuario_asignado = body.id_usuario_asignado || undefined
    if (body.id_usuario_asignado) ticket.estado = 'Asignado'
  }
  if (body.id_estado !== undefined) {
    ticket.estado = body.id_estado
    if (['Cerrado', 'Resuelto'].includes(body.id_estado)) {
      ticket.fecha_cierre_ticket = new Date()
    }
  }

  await ticket.save()

  if (esAdmin && body.id_usuario_asignado && body.id_usuario_asignado !== asignadoAnterior) {
    setTimeout(() => {
      notificarUsuarios([body.id_usuario_asignado], {
        title: 'Ticket asignado',
        body: ticket.titulo_ticket,
        url: `/tickets/${ticket._id}`,
        tag: `ticket-${ticket._id}`,
      }).catch((err) => console.error('Error enviando push:', err.message))
    }, 0)
  }

  const ticketCompleto = await conPopulate(Ticket.findById(ticket._id))
  res.json({ ticket: ticketCompleto })
}

export async function cambiarEstado(req, res) {
  const { id_estado } = req.body
  if (!id_estado) return res.status(400).json({ error: 'id_estado es obligatorio' })

  const ticket = await Ticket.findById(req.params.id)
  if (!ticket) return res.status(404).json({ error: 'Ticket no encontrado' })
  if (!tieneAcceso(ticket, req.usuario)) return res.status(403).json({ error: 'Sin acceso a este ticket' })

  ticket.estado = id_estado
  if (['Cerrado', 'Resuelto'].includes(id_estado)) {
    ticket.fecha_cierre_ticket = new Date()
  }
  await ticket.save()

  const ticketCompleto = await conPopulate(Ticket.findById(ticket._id))
  res.json({ ticket: ticketCompleto })
}

export async function contadoresUsuario(req, res) {
  const idUsuario = req.usuario.id_usuario

  const [creados, asignados] = await Promise.all([
    Ticket.countDocuments({ usuario_creador: idUsuario, estado: { $ne: 'Cerrado' } }),
    Ticket.countDocuments({ usuario_asignado: idUsuario, estado: { $ne: 'Cerrado' } }),
  ])

  res.json({ creados, asignados })
}

export async function metricasUsuario(req, res) {
  const { id_usuario, desde, hasta } = req.query
  if (!id_usuario) return res.status(400).json({ error: 'id_usuario es obligatorio' })
  if (!esStaffSigittn(req.usuario) && String(id_usuario) !== String(req.usuario.id_usuario)) {
    return res.status(403).json({ error: 'Solo puedes consultar tus propias métricas' })
  }

  const filtro = {
    usuario_asignado: id_usuario,
    estado: { $in: ['Resuelto', 'Cerrado'] },
    fecha_cierre_ticket: { $ne: null },
  }
  if (desde || hasta) {
    filtro.fecha_cierre_ticket = { ...filtro.fecha_cierre_ticket }
    if (desde) filtro.fecha_cierre_ticket.$gte = new Date(desde)
    if (hasta) filtro.fecha_cierre_ticket.$lte = new Date(hasta)
  }

  const tickets = await Ticket.find(filtro).select('nivel_urgencia fecha_creacion_ticket fecha_cierre_ticket')

  const totalResueltos = tickets.length
  const horas = tickets.map(
    (t) => (t.fecha_cierre_ticket - t.fecha_creacion_ticket) / (1000 * 60 * 60)
  )
  const promedioHoras = horas.length ? horas.reduce((a, b) => a + b, 0) / horas.length : 0

  const porNivel = tickets.reduce((acc, t) => {
    acc[t.nivel_urgencia] = (acc[t.nivel_urgencia] || 0) + 1
    return acc
  }, {})

  let masRapido = null
  let masLento = null
  tickets.forEach((t, i) => {
    if (masRapido === null || horas[i] < horas[masRapido]) masRapido = i
    if (masLento === null || horas[i] > horas[masLento]) masLento = i
  })

  res.json({
    total_resueltos: totalResueltos,
    promedio_horas: promedioHoras,
    por_nivel_urgencia: porNivel,
    ticket_mas_rapido: masRapido !== null ? { id_ticket: tickets[masRapido]._id, horas: horas[masRapido] } : null,
    ticket_mas_lento: masLento !== null ? { id_ticket: tickets[masLento]._id, horas: horas[masLento] } : null,
  })
}
