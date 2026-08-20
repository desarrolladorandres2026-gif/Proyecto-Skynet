import { verificarToken } from '../../middleware/auth.js'
import { requierePermiso } from '../../middleware/permisos.js'
import { requiereModuloActivo } from '../../middleware/moduloActivo.js'
import { safeRouter } from '../../middleware/safeRouter.js'
import { crear, listar, detalle, editar, archivar, eliminar } from './sig-banco.controller.js'

// Banco de preguntas: gestión exclusiva de quien tenga
// sig_pregunta_dia:gestionar_banco (rol SIG/HSEQ o Super Admin). Nadie "solo
// ve" el banco sin poder gestionarlo — a diferencia de "responder la
// pregunta del día" (universal, ver sig-respuestas.routes.js), esto no es
// una capacidad de cualquier trabajador.
const router = safeRouter()

router.use(verificarToken, requiereModuloActivo('sig_pregunta_dia'), requierePermiso('sig_pregunta_dia:gestionar_banco'))

router.post('/', crear)
router.get('/', listar)
router.get('/:id', detalle)
router.patch('/:id', editar)
router.patch('/:id/archivar', archivar)
router.delete('/:id', eliminar)

export default router
