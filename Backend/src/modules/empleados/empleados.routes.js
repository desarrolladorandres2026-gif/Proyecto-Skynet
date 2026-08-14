import { verificarToken } from '../../middleware/auth.js'
import { requierePermiso } from '../../middleware/permisos.js'
import { requiereModuloActivo } from '../../middleware/moduloActivo.js'
import { safeRouter } from '../../middleware/safeRouter.js'
import { listar, usuariosDisponibles, obtener, crear, actualizar, desvincular, reactivar } from './empleados.controller.js'

const router = safeRouter()

router.use(verificarToken, requiereModuloActivo('empleados'))

// empleados:ver alcanza para consultar (supervisión de solo lectura, ver
// rbac.data.js); las mutaciones exigen empleados:gestionar.
router.get('/', requierePermiso('empleados:gestionar', 'empleados:ver'), listar)
router.get('/usuarios-disponibles', requierePermiso('empleados:gestionar'), usuariosDisponibles)
router.get('/:id', requierePermiso('empleados:gestionar', 'empleados:ver'), obtener)

router.post('/', requierePermiso('empleados:gestionar'), crear)
router.put('/:id', requierePermiso('empleados:gestionar'), actualizar)
router.post('/:id/desvincular', requierePermiso('empleados:gestionar'), desvincular)
router.post('/:id/reactivar', requierePermiso('empleados:gestionar'), reactivar)

export default router
