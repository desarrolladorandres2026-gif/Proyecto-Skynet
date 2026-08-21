import { verificarToken } from '../../middleware/auth.js'
import { requierePermiso } from '../../middleware/permisos.js'
import { requiereModuloActivo } from '../../middleware/moduloActivo.js'
import { safeRouter } from '../../middleware/safeRouter.js'
import { crear, listar, detalle, actualizar, marcarParticipante } from './sig-capacitaciones.controller.js'

const router = safeRouter()

// Mismo permiso que sig-programacion.routes.js: programar una capacitación
// por tema es la misma responsabilidad que programar preguntas/campañas.
router.use(verificarToken, requiereModuloActivo('sig_pregunta_dia'), requierePermiso('sig_pregunta_dia:programar'))

router.post('/', crear)
router.get('/', listar)
router.get('/:id', detalle)
router.patch('/:id', actualizar)
router.patch('/:id/participantes/:usuarioId', marcarParticipante)

export default router
