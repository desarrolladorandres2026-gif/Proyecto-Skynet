import { listarModulos, cambiarEstadoModulo } from './sistema.controller.js'
import { verificarToken } from '../../middleware/auth.js'
import { requierePermiso } from '../../middleware/permisos.js'
import { safeRouter } from '../../middleware/safeRouter.js'

const router = safeRouter()

router.use(verificarToken)

// En la práctica solo el Super Admin (bypass de esSuperAdmin) usa esto; el
// permiso existe en el catálogo por si algún día se delega explícitamente.
router.get('/modulos', requierePermiso('sistema:gestionar_modulos'), listarModulos)
router.patch('/modulos/:key', requierePermiso('sistema:gestionar_modulos'), cambiarEstadoModulo)

export default router
