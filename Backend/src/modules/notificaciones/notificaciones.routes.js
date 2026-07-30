import { verificarToken } from '../../middleware/auth.js'
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
} from './notificaciones.controller.js'

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

export default router
