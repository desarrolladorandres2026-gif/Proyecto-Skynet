import { verificarToken, requireModulo } from '../../middleware/auth.js'
import { requiereModuloActivo } from '../../middleware/moduloActivo.js'
import { safeRouter } from '../../middleware/safeRouter.js'
import { uploadPdf } from './upload.js'

import { obtenerPanel } from './panel.controller.js'
import { obtenerCatalogos, agregarCatalogo, eliminarCatalogo } from './catalogos.controller.js'
import {
  listarEquipos,
  obtenerEquipo,
  fichaTecnica,
  crearEquipo,
  actualizarEquipo,
  eliminarEquipo,
} from './equipos.controller.js'
import {
  listarPendientes,
  listarFinalizados,
  listarProximos,
  listarProgramados,
  programarMantenimiento,
  registrarRealizado,
  registrarMantenimiento,
  editarMantenimiento,
  finalizarMantenimiento,
  eliminarMantenimiento,
  subirPdf,
  agregarInforme,
} from './mantenimientos.controller.js'

const router = safeRouter()

router.use(verificarToken, requiereModuloActivo('mantenimiento'), requireModulo('mantenimiento'))

router.get('/panel', obtenerPanel)

router.get('/catalogos', obtenerCatalogos)
router.post('/catalogos/agregar', agregarCatalogo)
router.post('/catalogos/eliminar', eliminarCatalogo)

router.get('/equipos', listarEquipos)
router.post('/equipos', crearEquipo)
router.get('/equipos/:id', obtenerEquipo)
router.put('/equipos/:id', actualizarEquipo)
router.delete('/equipos/:id', eliminarEquipo)
router.get('/equipos/:id/ficha', fichaTecnica)
router.post('/equipos/:equipo_id/mantenimiento', uploadPdf.single('archivo_mantenimiento'), registrarMantenimiento)

router.get('/mantenimientos/pendientes', listarPendientes)
router.get('/mantenimientos/finalizados', listarFinalizados)
router.get('/mantenimientos/proximos', listarProximos)
router.get('/mantenimientos/programados', listarProgramados)
router.post('/mantenimientos/programar', programarMantenimiento)
router.post('/mantenimientos/registrar-realizado', registrarRealizado)
router.post('/mantenimientos/:id/editar', editarMantenimiento)
router.post('/mantenimientos/:id/finalizar', finalizarMantenimiento)
router.post('/mantenimientos/:id/subir_pdf', uploadPdf.single('pdf_file'), subirPdf)
router.delete('/mantenimientos/:id', eliminarMantenimiento)
router.post('/mantenimientos/:id/agregar_informe', uploadPdf.single('archivo_informe'), agregarInforme)

export default router
