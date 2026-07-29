import {
  listarRoles,
  obtenerRol,
  crearRol,
  actualizarRol,
  eliminarRol,
} from './roles.controller.js'
import { verificarToken } from '../../middleware/auth.js'
import { requierePermiso } from '../../middleware/permisos.js'
import { safeRouter } from '../../middleware/safeRouter.js'

const router = safeRouter()

router.use(verificarToken)

router.get('/', requierePermiso('roles:gestionar'), listarRoles)
router.get('/:id', requierePermiso('roles:gestionar'), obtenerRol)
router.post('/', requierePermiso('roles:gestionar'), crearRol)
router.put('/:id', requierePermiso('roles:gestionar', 'roles:asignar_permisos'), actualizarRol)
router.delete('/:id', requierePermiso('roles:gestionar'), eliminarRol)

export default router
