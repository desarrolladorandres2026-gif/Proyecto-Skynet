import { verificarToken, requireModulo } from '../../middleware/auth.js'
import { requiereModuloActivo } from '../../middleware/moduloActivo.js'
import { safeRouter } from '../../middleware/safeRouter.js'
import { obtenerCatalogos } from './catalogos.controller.js'
import {
  listarTickets,
  obtenerTicket,
  crearTicket,
  actualizarTicket,
  cambiarEstado,
  contadoresUsuario,
  metricasUsuario,
} from './tickets.controller.js'
import {
  listarMensajes,
  crearMensaje,
  marcarLeido,
  noLeidos,
  marcarTodosLeidos,
} from './mensajes.controller.js'
import { getVapidPublicKey, suscribir, desuscribir } from './push.controller.js'
import { subirArchivo, uploadMiddleware } from './upload.controller.js'

const router = safeRouter()

// pública, sin token
router.get('/push/vapid-public-key', getVapidPublicKey)

router.use(verificarToken, requiereModuloActivo('sigittn'), requireModulo('sigittn'))

router.get('/catalogos', obtenerCatalogos)

router.get('/tickets/contadores', contadoresUsuario)
router.get('/tickets/metricas', metricasUsuario)
router.get('/tickets', listarTickets)
router.get('/tickets/:id', obtenerTicket)
router.post('/tickets', crearTicket)
router.put('/tickets/:id', actualizarTicket)
router.patch('/tickets/:id/estado', cambiarEstado)

router.get('/mensajes/no-leidos', noLeidos)
router.get('/tickets/:id/mensajes', listarMensajes)
router.post('/tickets/:id/mensajes', crearMensaje)
router.patch('/tickets/:id/mensajes/leidos', marcarTodosLeidos)
router.patch('/tickets/:id/mensajes/:idMensaje/leido', marcarLeido)

router.post('/push/suscribir', suscribir)
router.post('/push/desuscribir', desuscribir)

router.post('/upload', uploadMiddleware, subirArchivo)

export default router
