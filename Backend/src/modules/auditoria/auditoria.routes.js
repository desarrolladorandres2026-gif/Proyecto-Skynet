import { listarAuditoria } from './auditoria.controller.js'
import { verificarToken } from '../../middleware/auth.js'
import { requierePermiso } from '../../middleware/permisos.js'
import { safeRouter } from '../../middleware/safeRouter.js'

const router = safeRouter()

router.use(verificarToken)

// Solo lectura, exclusivo de "Auditoría y registros" (Super Admin en la
// especificación original — esSuperAdmin ya bypassa, pero se deja el permiso
// explícito por si algún día se delega a otro rol).
router.get('/', requierePermiso('auditoria:leer'), listarAuditoria)

export default router
