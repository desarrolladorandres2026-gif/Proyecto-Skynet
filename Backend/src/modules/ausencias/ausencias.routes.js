import { verificarToken } from '../../middleware/auth.js'
import { requierePermiso } from '../../middleware/permisos.js'
import { requiereModuloActivo } from '../../middleware/moduloActivo.js'
import { safeRouter } from '../../middleware/safeRouter.js'
import { validarContenidoReal } from '../../utils/validarContenidoArchivo.js'
import { uploadSoporte } from './ausencias.upload.js'
import { PERMISOS_TRAMITE_INCAPACIDAD } from './ausencias.service.js'
import {
  crear, misAusencias, bandeja, listarTodas, calendario, detalle,
  soporte, aprobar, rechazar, cancelar,
  tramiteIncapacidades, supervisionIncapacidades, destinatariosIncapacidades,
  verificarIncapacidad, devolverIncapacidad, reenviarIncapacidad,
  foliarIncapacidad, direccionarIncapacidad, completarFolioIncapacidad, tramitarIncapacidad,
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
// Trámite de incapacidades (verificación -> folio -> direccionamiento). Cada
// bandeja se limita a quien interviene en el trámite; la supervisión ve todas.
router.get('/incapacidades/tramite', requierePermiso(...PERMISOS_TRAMITE_INCAPACIDAD), tramiteIncapacidades)
router.get('/incapacidades/supervision', requierePermiso('ausencias:supervisar_incapacidades'), supervisionIncapacidades)
router.get('/incapacidades/destinatarios', requierePermiso('ausencias:direccionar_incapacidades'), destinatariosIncapacidades)

router.get('/:id', detalle)
router.get('/:id/soporte', soporte)
router.get('/:id/soporte/:nombreArchivo', soporte)

router.post('/:id/aprobar', requierePermiso('ausencias:aprobar'), aprobar)
router.post('/:id/rechazar', requierePermiso('ausencias:aprobar'), rechazar)
// Sin permiso: el service ya exige ser el dueño de la solicitud.
router.post('/:id/cancelar', cancelar)

router.post('/:id/verificar', requierePermiso('ausencias:verificar_incapacidades'), verificarIncapacidad)
router.post('/:id/devolver', requierePermiso('ausencias:verificar_incapacidades'), devolverIncapacidad)
// Sin permiso: quien corrige es el dueño (el service lo exige), con el soporte nuevo.
router.post('/:id/reenviar', uploadSoporte.single('soporte'), contenidoSoporteValido, reenviarIncapacidad)
router.post('/:id/foliar', requierePermiso('ausencias:foliar_incapacidades'), foliarIncapacidad)
router.post('/:id/completar-folio', requierePermiso('ausencias:foliar_incapacidades'), completarFolioIncapacidad)
router.post('/:id/direccionar', requierePermiso('ausencias:direccionar_incapacidades'), direccionarIncapacidad)
router.post('/:id/tramitar', requierePermiso('ausencias:recibir_incapacidades'), tramitarIncapacidad)

export default router
