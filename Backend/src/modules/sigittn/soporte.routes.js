import { verificarToken } from '../../middleware/auth.js'
import { requiereModuloActivo } from '../../middleware/moduloActivo.js'
import { safeRouter } from '../../middleware/safeRouter.js'
import { obtenerTicket } from './tickets.controller.js'
import { misTickets, crearTicketSoporte } from './soporte.controller.js'
import { listarMensajes, crearMensaje, marcarTodosLeidos } from './mensajes.controller.js'
import { uploadMiddleware, subirArchivo } from './upload.controller.js'

// Acceso reducido a SIGITTN pensado para cualquier usuario autenticado (p.
// ej. usuario_comun), sin el flag legado Usuario.modulos.sigittn que reserva
// la bandeja completa (todos los tickets, reasignar, catálogos de
// dependencias) al personal de TI — ver sigittn.routes.js. Reusa el mismo
// modelo Ticket: un ticket creado aquí también aparece en esa bandeja con
// modulo_origen = "Usuario común".
//
// obtenerTicket/listarMensajes/crearMensaje/marcarTodosLeidos se reusan tal
// cual de sigittn: ya restringen correctamente a creador-o-asignado vía
// tieneAcceso (ver accesoTicket.js) — alguien de acá nunca está asignado, así
// que solo ve lo suyo, automáticamente.
const router = safeRouter()

router.use(verificarToken, requiereModuloActivo('sigittn'))

router.get('/tickets/mios', misTickets)
router.post('/tickets', crearTicketSoporte)
router.get('/tickets/:id', obtenerTicket)

router.get('/tickets/:id/mensajes', listarMensajes)
router.post('/tickets/:id/mensajes', crearMensaje)
router.patch('/tickets/:id/mensajes/leidos', marcarTodosLeidos)

router.post('/upload', uploadMiddleware, subirArchivo)

export default router
