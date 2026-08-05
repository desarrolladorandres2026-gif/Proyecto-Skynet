import { verificarToken } from '../../middleware/auth.js'
import { cargarScopeEmpresa } from '../../middleware/permisos.js'
import { safeRouter } from '../../middleware/safeRouter.js'
import { resumenDashboard } from './dashboard.controller.js'

const router = safeRouter()

router.use(verificarToken, cargarScopeEmpresa)

// Dashboard: universal — cada rol recibe solo las tarjetas de sus permisos.
// Es el único endpoint que queda en este router desde que el módulo
// "Operación" (rutas, objetos perdidos) se retiró del sistema; el dashboard
// es núcleo y no se movió a otro módulo para no romper /api/dashboard.
router.get('/dashboard', resumenDashboard)

export default router
