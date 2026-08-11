import { verificarToken } from '../../middleware/auth.js'
import { requierePermiso } from '../../middleware/permisos.js'
import { requiereModuloActivo } from '../../middleware/moduloActivo.js'
import { safeRouter } from '../../middleware/safeRouter.js'
import { emailAccionLimiter } from '../../middleware/rateLimit.js'
import {
  estado, listar, buscar, detalle, enviar, eliminar, marcarLeido, archivar,
  iniciarConexionGmail, aprobarConexionGmail, denegarConexionGmail, callbackGmail, desconectar,
} from './email.controller.js'

const router = safeRouter()

// Públicas (sin cookie de sesión): se abren desde el cliente de correo del
// usuario o desde la redirección de Google, no necesariamente en el mismo
// dispositivo donde tiene sesión abierta en Skynet. Su autorización es el
// token de un solo uso de EmailConexionSolicitud / el `state` firmado, no la
// cookie — mismo patrón que /notificaciones/baja.
router.get('/oauth/gmail/aprobar', requiereModuloActivo('email'), aprobarConexionGmail)
router.get('/oauth/gmail/denegar', requiereModuloActivo('email'), denegarConexionGmail)
router.get('/oauth/gmail/callback', requiereModuloActivo('email'), callbackGmail)

router.use(verificarToken, requiereModuloActivo('email'))

router.get('/oauth/gmail/iniciar', emailAccionLimiter, requierePermiso('email:configurar'), iniciarConexionGmail)
router.delete('/oauth/gmail', requierePermiso('email:configurar'), desconectar)

router.get('/estado', requierePermiso('email:ver'), estado)
router.get('/', requierePermiso('email:leer'), listar)
router.get('/buscar', requierePermiso('email:buscar'), buscar)
router.get('/:id', requierePermiso('email:leer'), detalle)
router.post('/', emailAccionLimiter, requierePermiso('email:enviar'), enviar)
router.delete('/:id', requierePermiso('email:eliminar'), eliminar)
router.patch('/:id/leido', requierePermiso('email:leer'), marcarLeido)
router.patch('/:id/archivar', requierePermiso('email:eliminar'), archivar)

export default router
