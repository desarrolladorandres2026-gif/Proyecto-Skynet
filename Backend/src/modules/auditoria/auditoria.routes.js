import { listarAuditoria, eliminarRegistro, eliminarRegistrosMasivo, obtenerFiltros } from './auditoria.controller.js'
import { verificarToken, soloAdmin } from '../../middleware/auth.js'
import { requierePermiso } from '../../middleware/permisos.js'
import { safeRouter } from '../../middleware/safeRouter.js'

const router = safeRouter()

router.use(verificarToken)

// Solo lectura, exclusivo de "Auditoría y registros" (Super Admin en la
// especificación original — esSuperAdmin ya bypassa, pero se deja el permiso
// explícito por si algún día se delega a otro rol).
router.get('/filtros', requierePermiso('auditoria:leer'), obtenerFiltros)
router.get('/', requierePermiso('auditoria:leer'), listarAuditoria)

// Eliminar (uno o en lote) SÍ queda atado al bypass esSuperAdmin en sí
// (soloAdmin), no al permiso delegable auditoria:leer — mismo criterio que el
// backup completo en backup.routes.js: borrar el rastro de auditoría nunca
// debe poder delegarse a otro rol solo porque tenga acceso de lectura.
router.delete('/lote', soloAdmin, eliminarRegistrosMasivo)
router.delete('/:id', soloAdmin, eliminarRegistro)

export default router
