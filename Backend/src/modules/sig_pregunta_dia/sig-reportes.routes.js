import { verificarToken } from '../../middleware/auth.js'
import { requierePermiso } from '../../middleware/permisos.js'
import { requiereModuloActivo } from '../../middleware/moduloActivo.js'
import { safeRouter } from '../../middleware/safeRouter.js'
import { dashboard, trabajadoresParticipantes, reporteTrabajador, planRefuerzo, actualizarPlanRefuerzo, exportar } from './sig-reportes.controller.js'

// No colisiona con sig-respuestas.routes.js (también montado en la raíz de
// /sig_pregunta_dia): esas rutas son /pregunta-del-dia, /programacion/:id/
// responder, /mi-historial, /mi-progreso — ninguna empieza por /dashboard ni
// /reportes.
const router = safeRouter()

router.use(verificarToken, requiereModuloActivo('sig_pregunta_dia'), requierePermiso('sig_pregunta_dia:ver_reportes'))

router.get('/dashboard', dashboard)
router.get('/reportes/trabajadores', trabajadoresParticipantes)
router.get('/reportes/trabajador/:usuarioId', reporteTrabajador)
router.get('/reportes/plan-refuerzo', planRefuerzo)
router.patch('/reportes/plan-refuerzo/:id', actualizarPlanRefuerzo)
router.get('/reportes/exportar', exportar)

export default router
