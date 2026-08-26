import { verificarToken } from '../../middleware/auth.js'
import { requierePermiso } from '../../middleware/permisos.js'
import { requiereModuloActivo } from '../../middleware/moduloActivo.js'
import { safeRouter } from '../../middleware/safeRouter.js'
import { validarContenidoReal } from '../../utils/validarContenidoArchivo.js'
import { uploadSoporte } from './ausencias.upload.js'
import {
  crear, misAusencias, bandeja, listarTodas, calendario, detalle,
  soporte, aprobar, rechazar, cancelar,
} from './ausencias.controller.js'

// Solicitar una ausencia y ver las propias son capacidad universal de
// cualquier persona autenticada — igual que "Reportar daño" o crear un
// requerimiento: pedir vacaciones no es un privilegio que se asigne por RBAC,
// es consecuencia de trabajar aquí. Aprobar y supervisar sí exigen permiso.
const router = safeRouter()

const contenidoSoporteValido = validarContenidoReal(() => ['imagen', 'pdf'])

router.use(verificarToken, requiereModuloActivo('ausencias'))

// Rutas literales antes de '/:id': si no, Express las trataría como un id.
router.post('/', uploadSoporte.single('soporte'), contenidoSoporteValido, crear)
router.get('/', requierePermiso('ausencias:ver_todas'), listarTodas)
router.get('/mias', misAusencias)
router.get('/bandeja', requierePermiso('ausencias:aprobar'), bandeja)
router.get('/calendario', requierePermiso('ausencias:aprobar', 'ausencias:ver_todas'), calendario)
router.get('/:id', detalle)
router.get('/:id/soporte', soporte)
router.get('/:id/soporte/:nombreArchivo', soporte)

router.post('/:id/aprobar', requierePermiso('ausencias:aprobar'), aprobar)
router.post('/:id/rechazar', requierePermiso('ausencias:aprobar'), rechazar)
// Sin permiso: el service ya exige ser el dueño de la solicitud.
router.post('/:id/cancelar', cancelar)

export default router
