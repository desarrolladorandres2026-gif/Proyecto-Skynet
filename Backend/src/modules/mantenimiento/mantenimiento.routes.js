import { verificarToken, requireModulo, soloAdmin } from '../../middleware/auth.js'
import { requiereModuloActivo } from '../../middleware/moduloActivo.js'
import { safeRouter } from '../../middleware/safeRouter.js'
import { uploadPdf } from './upload.js'
import { validarContenidoReal } from '../../utils/validarContenidoArchivo.js'

const soloPdf = validarContenidoReal(() => ['pdf'])

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
  archivoPdf,
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
// El módulo legado gobierna con un solo flag binario (Usuario.modulos,
// requireModulo arriba) sin distinguir técnico de supervisor, así que este
// router no tiene hoy ninguna noción intermedia de "puede administrar pero
// no puede borrar". Borrar un equipo además borra en cascada TODO su
// historial de mantenimientos (ver eliminarEquipo, Mantenimiento.deleteMany)
// — es la acción más destructiva e irreversible de todo el módulo, así que
// se restringe al mínimo posible sin inventar un permiso RBAC nuevo para un
// módulo que ya está marcado como deprecado (ver Usuario.js): solo Super
// Admin. El resto de operaciones (crear/editar equipo, registrar
// mantenimientos) sigue igual que antes para no romper el uso diario del
// módulo. Ver auditoría de producción 2026-08-22, Fase 4.
router.delete('/equipos/:id', soloAdmin, eliminarEquipo)
router.get('/equipos/:id/ficha', fichaTecnica)
router.post('/equipos/:equipo_id/mantenimiento', uploadPdf.single('archivo_mantenimiento'), soloPdf, registrarMantenimiento)

router.get('/mantenimientos/pendientes', listarPendientes)
router.get('/mantenimientos/finalizados', listarFinalizados)
router.get('/mantenimientos/proximos', listarProximos)
router.get('/mantenimientos/programados', listarProgramados)
router.post('/mantenimientos/programar', programarMantenimiento)
router.post('/mantenimientos/registrar-realizado', registrarRealizado)
router.post('/mantenimientos/:id/editar', editarMantenimiento)
router.post('/mantenimientos/:id/finalizar', finalizarMantenimiento)
router.post('/mantenimientos/:id/subir_pdf', uploadPdf.single('pdf_file'), soloPdf, subirPdf)
// Mismo criterio que DELETE /equipos/:id arriba: borra permanentemente un
// registro histórico de mantenimiento, sin ninguna protección adicional hoy
// más allá del flag binario del módulo. Solo Super Admin.
router.delete('/mantenimientos/:id', soloAdmin, eliminarMantenimiento)
router.post('/mantenimientos/:id/agregar_informe', uploadPdf.single('archivo_informe'), soloPdf, agregarInforme)
router.get('/mantenimientos/:id/archivo/:nombreArchivo', archivoPdf)

export default router
