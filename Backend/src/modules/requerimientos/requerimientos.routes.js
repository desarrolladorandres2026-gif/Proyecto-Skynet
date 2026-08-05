import { verificarToken, soloAdmin } from '../../middleware/auth.js'
import { requierePermiso } from '../../middleware/permisos.js'
import { requiereModuloActivo } from '../../middleware/moduloActivo.js'
import { safeRouter } from '../../middleware/safeRouter.js'
import {
  crear, misRequerimientos, bandejaFinanciero, bandejaBodega, listarTodos, detalle,
  editarFinanciero, aprobarFinanciero, rechazarFinanciero, marcarEstadoBodega, marcarControlRecibido,
  exportar, eliminarPorRango,
} from './requerimientos.controller.js'

// Crear un requerimiento y ver los propios son capacidad universal (igual
// que "Reportar daño" en modules/danos): solo verificarToken, sin permiso.
// Cada acción de gestión (Financiero, Bodega, supervisión) exige su propio
// permiso puntual.
const router = safeRouter()

router.use(verificarToken, requiereModuloActivo('requerimientos'))

// Rutas literales antes de '/:id': si no, Express las trataría como un id.
router.post('/', crear)
router.get('/', requierePermiso('requerimientos:ver_todos'), listarTodos)
router.get('/mios', misRequerimientos)
router.get('/financiero', requierePermiso('requerimientos:aprobar_financiero'), bandejaFinanciero)
router.get('/bodega', requierePermiso('requerimientos:gestionar_bodega'), bandejaBodega)
// Mismos 3 permisos que gobiernan las bandejas de Bodega/Financiero y la
// vista de supervisión — exportar un rango de fechas no es una acción de
// gestión nueva, es una lectura más de lo que cada uno ya puede ver.
router.get(
  '/exportar',
  requierePermiso('requerimientos:aprobar_financiero', 'requerimientos:gestionar_bodega', 'requerimientos:ver_todos'),
  exportar
)
// Purga masiva por rango de fechas: exclusiva de Super Admin (no hay
// permiso RBAC para esto — es una operación de mantenimiento de la
// plataforma, no de negocio). soloAdmin ya cubre el bypass de esSuperAdmin.
router.delete('/', soloAdmin, eliminarPorRango)
router.get('/:id', detalle)

router.patch('/:id/financiero', requierePermiso('requerimientos:aprobar_financiero'), editarFinanciero)
router.post('/:id/financiero/aprobar', requierePermiso('requerimientos:aprobar_financiero'), aprobarFinanciero)
router.post('/:id/financiero/rechazar', requierePermiso('requerimientos:aprobar_financiero'), rechazarFinanciero)
router.patch('/:id/bodega/estado', requierePermiso('requerimientos:gestionar_bodega'), marcarEstadoBodega)
router.patch('/:id/bodega/items/:itemId/recibido', requierePermiso('requerimientos:gestionar_bodega'), marcarControlRecibido)

export default router
