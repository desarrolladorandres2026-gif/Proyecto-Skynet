import { verificarToken } from '../../middleware/auth.js'
import { requierePermiso } from '../../middleware/permisos.js'
import { requiereModuloActivo } from '../../middleware/moduloActivo.js'
import { safeRouter } from '../../middleware/safeRouter.js'
import {
  listarCategorias, listarAvisosPendientes, marcarAvisosLeidos,
  obtenerPreferencias, actualizarPreferencias,
  obtenerConfiguracionGlobal, actualizarConfiguracionGlobal,
} from './ia.controller.js'

const router = safeRouter()

router.use(verificarToken, requiereModuloActivo('ia'))

// Universal: cualquier autenticado ve/ajusta SUS avisos, igual que
// /notificaciones/preferencias.
router.get('/categorias', listarCategorias)
router.get('/avisos', listarAvisosPendientes)
router.post('/avisos/marcar-leidos', marcarAvisosLeidos)
router.get('/preferencias', obtenerPreferencias)
router.put('/preferencias', actualizarPreferencias)

// Interruptor maestro por categoría, a nivel de toda la plataforma.
router.get('/configuracion', requierePermiso('ia:configurar'), obtenerConfiguracionGlobal)
router.put('/configuracion', requierePermiso('ia:configurar'), actualizarConfiguracionGlobal)

export default router
