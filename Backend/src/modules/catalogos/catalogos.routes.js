import { obtenerCatalogos, agregarCatalogo, eliminarCatalogo } from './catalogos.controller.js'
import { verificarToken } from '../../middleware/auth.js'
import { requierePermiso } from '../../middleware/permisos.js'
import { safeRouter } from '../../middleware/safeRouter.js'

const router = safeRouter()

router.use(verificarToken)

// GET abierto a cualquier autenticado: los selects de Dependencia/Cargo se
// usan en formularios de todos los roles (Usuarios, Requerimientos, Equipos),
// no solo por quien administra el catálogo.
router.get('/', obtenerCatalogos)
router.post('/agregar', requierePermiso('catalogos:gestionar'), agregarCatalogo)
router.post('/eliminar', requierePermiso('catalogos:gestionar'), eliminarCatalogo)

export default router
