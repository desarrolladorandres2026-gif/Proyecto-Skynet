import { listarPermisos } from './permisos.controller.js'
import { verificarToken } from '../../middleware/auth.js'
import { requierePermiso } from '../../middleware/permisos.js'
import { safeRouter } from '../../middleware/safeRouter.js'

const router = safeRouter()

router.use(verificarToken)

// Solo lectura: alimenta la matriz de permisos de RolesPage. Mismo permiso
// que gestionar/asignar roles — quien no puede tocar roles no necesita ver
// el catálogo completo de permisos.
router.get('/', requierePermiso('roles:gestionar', 'roles:asignar_permisos'), listarPermisos)

export default router
