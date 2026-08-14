import {
  obtenerCatalogos, agregarCatalogo, eliminarCatalogo, actualizarDependencia, actualizarCargo,
} from './catalogos.controller.js'
import { verificarToken } from '../../middleware/auth.js'
import { requierePermiso } from '../../middleware/permisos.js'
import { safeRouter } from '../../middleware/safeRouter.js'

const router = safeRouter()

router.use(verificarToken)

// GET abierto a cualquier autenticado: los selects de Dependencia/Cargo se
// usan en formularios de todos los roles (Usuarios, Requerimientos, Equipos),
// no solo por quien administra el catálogo.
router.get('/', obtenerCatalogos)
router.post('/agregar', requierePermiso('catalogos:gestionar'), agregarCatalogo)
router.post('/eliminar', requierePermiso('catalogos:gestionar'), eliminarCatalogo)

// Estructura organizacional (Talento Humano Fase 1): jerarquía/jefe de
// Dependencia y dependencia por defecto de Cargo. Permiso empleados:gestionar
// (Talento Humano), NO catalogos:gestionar: agregar/eliminar VALORES del
// catálogo (arriba) es una tarea administrativa genérica que ya tiene
// Administrador; decidir la jerarquía y quién es jefe de quién es una
// decisión de Talento Humano específicamente, igual criterio que
// ausencias:aprobar (ver rbac.data.js).
router.patch('/dependencia/:id', requierePermiso('empleados:gestionar'), actualizarDependencia)
router.patch('/cargo/:id', requierePermiso('empleados:gestionar'), actualizarCargo)

export default router
