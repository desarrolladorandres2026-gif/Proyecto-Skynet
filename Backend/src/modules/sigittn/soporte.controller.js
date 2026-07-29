import Ticket from '../../models/sigittn/Ticket.js'
import { notificarUsuarios, getAdminIds } from '../../utils/sendPush.js'

const POPULATE_USUARIO = 'nombre_usuario nombre'
const MODULO_ORIGEN_SOPORTE = 'Usuario común'
const NIVELES_URGENCIA = ['Baja', 'Media', 'Alta']

function conPopulate(query) {
  return query
    .populate('usuario_creador', POPULATE_USUARIO)
    .populate('usuario_asignado', POPULATE_USUARIO)
    .populate('mensajes.usuario', POPULATE_USUARIO)
}

// Acceso reducido a SIGITTN (ver soporte.routes.js): solo lo propio, sin el
// flag legado Usuario.modulos.sigittn. listarTickets (tickets.controller.js)
// no sirve aquí porque no filtra por creador — cualquiera con ese endpoint
// vería los tickets de todo el mundo.
export async function misTickets(req, res) {
  const tickets = await conPopulate(Ticket.find({ usuario_creador: req.usuario.id_usuario })).sort({
    fecha_creacion_ticket: -1,
  })
  res.json({ tickets })
}

export async function crearTicketSoporte(req, res) {
  const { titulo_ticket, descripcion_ticket, nivel_urgencia } = req.body
  if (!titulo_ticket?.trim()) {
    return res.status(400).json({ error: 'El título es obligatorio' })
  }

  const ticket = await Ticket.create({
    titulo_ticket: titulo_ticket.trim(),
    descripcion_ticket: descripcion_ticket?.trim() || '',
    // Fijo (no lo elige quien reporta): así el personal de TI reconoce estos
    // tickets en su bandeja normal (sigittn.routes.js) sin código nuevo, solo
    // filtrando por "módulo de origen" como ya hacían.
    modulo_origen: MODULO_ORIGEN_SOPORTE,
    nivel_urgencia: NIVELES_URGENCIA.includes(nivel_urgencia) ? nivel_urgencia : 'Media',
    estado: 'Nuevo',
    usuario_creador: req.usuario.id_usuario,
  })

  const adminIds = await getAdminIds()
  setTimeout(() => {
    notificarUsuarios(adminIds.map(String), {
      title: 'Nueva solicitud de soporte',
      body: titulo_ticket,
      url: `/sigittn/tickets/${ticket._id}`,
      tag: `ticket-${ticket._id}`,
    }).catch((err) => console.error('Error enviando push:', err.message))
  }, 0)

  const ticketCompleto = await conPopulate(Ticket.findById(ticket._id))
  res.status(201).json({ ticket: ticketCompleto })
}
