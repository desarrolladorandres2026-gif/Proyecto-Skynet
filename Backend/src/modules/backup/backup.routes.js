import { verificarToken, soloAdmin } from '../../middleware/auth.js'
import { backupLimiter } from '../../middleware/rateLimit.js'
import { safeRouter } from '../../middleware/safeRouter.js'
import { exportarBackup, listarColecciones } from './backup.controller.js'
import { previsualizar, rescatar, purgar } from './purga.controller.js'

const router = safeRouter()

router.use(verificarToken)

// Exclusivo Super Admin: es una herramienta de mantenimiento de plataforma
// (respalda TODA la información, incluida la de otros roles), no una acción
// de negocio con permiso RBAC propio — mismo criterio que la purga por rango
// de fechas de Requerimientos (soloAdmin, ver requerimientos.routes.js).
// /colecciones alimenta el panel de personalización del frontend (checkbox
// por colección) — de solo lectura y barato, sin backupLimiter.
router.get('/colecciones', soloAdmin, listarColecciones)
router.get('/exportar', backupLimiter, soloAdmin, exportarBackup)

// "Rescatar y eliminar" histórico (solo colecciones transaccionales, ver
// COLECCIONES_PURGABLES en backup.config.js): previsualizar es de solo
// lectura y barata, así que no lleva backupLimiter; rescatar/purgar sí, por
// el mismo motivo que el backup completo (recorren varias colecciones).
router.get('/purga/previsualizar', soloAdmin, previsualizar)
router.get('/purga/rescate', backupLimiter, soloAdmin, rescatar)
router.delete('/purga', backupLimiter, soloAdmin, purgar)

export default router
