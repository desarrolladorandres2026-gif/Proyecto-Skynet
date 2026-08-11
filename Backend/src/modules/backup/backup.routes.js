import { verificarToken, soloAdmin } from '../../middleware/auth.js'
import { backupLimiter } from '../../middleware/rateLimit.js'
import { safeRouter } from '../../middleware/safeRouter.js'
import { exportarBackup } from './backup.controller.js'

const router = safeRouter()

router.use(verificarToken)

// Exclusivo Super Admin: es una herramienta de mantenimiento de plataforma
// (respalda TODA la información, incluida la de otros roles), no una acción
// de negocio con permiso RBAC propio — mismo criterio que la purga por rango
// de fechas de Requerimientos (soloAdmin, ver requerimientos.routes.js).
router.get('/exportar', backupLimiter, soloAdmin, exportarBackup)

export default router
