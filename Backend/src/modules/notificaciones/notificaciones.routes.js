import { verificarToken } from '../../middleware/auth.js'
import { requierePermiso } from '../../middleware/permisos.js'
import { safeRouter } from '../../middleware/safeRouter.js'
import {
  getVapidPublicKey,
  suscribirPush,
  desuscribirPush,
  misDispositivos,
  olvidarDispositivo,
  listarCategorias,
  obtenerPreferencias,
  actualizarPreferencias,
  darDeBajaEmail,
  obtenerCanalesAdmin,
  actualizarCanalesAdmin,
} from './notificaciones.controller.js'
import {
  misNotificaciones,
  contarNoLeidas,
  marcarNotificacionLeida,
  marcarTodasNotificacionesLeidas,
} from './centro.controller.js'
import { listarEnviosAdmin, obtenerFiltrosEnvios } from './historial.controller.js'

const router = safeRouter()

// Públicas: la clave VAPID la necesita el navegador ANTES de tener sesión
// verificada (se usa al construir la suscripción push), y la baja de correo
// se abre desde un cliente de correo sin cookie de sesión.
router.get('/push/vapid-public-key', getVapidPublicKey)
router.get('/baja', darDeBajaEmail)
// One-click unsubscribe (RFC 8058): Gmail/Outlook hacen POST a esta misma
// URL desde su botón nativo de "Cancelar suscripción", sin abrir el
// navegador. Ver headersListaBaja() en notificaciones.plantillas.js.
router.post('/baja', darDeBajaEmail)

router.use(verificarToken)

router.get('/categorias', listarCategorias)
router.get('/preferencias', obtenerPreferencias)
router.put('/preferencias', actualizarPreferencias)

router.post('/push/suscribir', suscribirPush)
router.post('/push/desuscribir', desuscribirPush)
router.get('/dispositivos', misDispositivos)
router.delete('/dispositivos/:id', olvidarDispositivo)

// Centro de notificaciones (campana): SIEMPRE sobre el usuario de la sesión
// (req.usuario.id_usuario dentro del controller) — ningún endpoint acepta un
// usuarioId de query/body. Rutas literales antes de '/mias/:id/leida' para
// que Express no confunda "leidas" con un :id.
router.get('/mias', misNotificaciones)
router.get('/mias/no-leidas', contarNoLeidas)
router.put('/mias/leidas', marcarTodasNotificacionesLeidas)
router.put('/mias/:id/leida', marcarNotificacionLeida)

// Historial administrativo de envíos (push/email): solo lectura, exclusivo
// de "Ver historial de envíos de notificaciones" (esSuperAdmin ya bypassa
// vía requierePermiso, se deja el permiso explícito por si se delega a otro
// rol más adelante — mismo criterio que auditoria:leer).
router.get('/admin/envios/filtros', requierePermiso('notificaciones:ver_historial'), obtenerFiltrosEnvios)
router.get('/admin/envios', requierePermiso('notificaciones:ver_historial'), listarEnviosAdmin)

// Elección y configuración de canales de notificación (Email/Push por categoría)
router.get('/admin/canales', requierePermiso(['notificaciones:ver_historial', 'notificaciones:configurar_canales']), obtenerCanalesAdmin)
router.put('/admin/canales', requierePermiso(['notificaciones:ver_historial', 'notificaciones:configurar_canales']), actualizarCanalesAdmin)

export default router

