import { verificarToken } from '../../middleware/auth.js'
import { requierePermiso } from '../../middleware/permisos.js'
import { requiereModuloActivo } from '../../middleware/moduloActivo.js'
import { safeRouter } from '../../middleware/safeRouter.js'
import {
  crearIndividual, listarIndividual, cancelarIndividual, calendario,
  previsualizarCampana, crearCampana, listarCampanas, detalleCampana,
  pausarCampana, reanudarCampana, cancelarCampana,
} from './sig-programacion.controller.js'

const router = safeRouter()

router.use(verificarToken, requiereModuloActivo('sig_pregunta_dia'), requierePermiso('sig_pregunta_dia:programar'))

router.get('/calendario', calendario)
router.post('/individual', crearIndividual)
router.get('/individual', listarIndividual)
router.post('/individual/:id/cancelar', cancelarIndividual)

// Rutas literales antes de '/campanas/:id': si no, Express trataría
// 'previsualizar' como un :id.
router.post('/campanas/previsualizar', previsualizarCampana)
router.post('/campanas', crearCampana)
router.get('/campanas', listarCampanas)
router.get('/campanas/:id', detalleCampana)
router.post('/campanas/:id/pausar', pausarCampana)
router.post('/campanas/:id/reanudar', reanudarCampana)
router.post('/campanas/:id/cancelar', cancelarCampana)

export default router
