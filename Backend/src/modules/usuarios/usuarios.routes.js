import {
  buscarUsuarios,
  listarUsuarios,
  crearUsuario,
  actualizarUsuario,
  convertirUsuarioReal,
  eliminarUsuario,
} from './usuarios.controller.js'
import { verificarToken } from '../../middleware/auth.js'
import { requierePermiso } from '../../middleware/permisos.js'
import { safeRouter } from '../../middleware/safeRouter.js'

const router = safeRouter()

router.use(verificarToken, requierePermiso('usuarios:gestionar'))

router.get('/buscar', buscarUsuarios)
router.get('/', listarUsuarios)
router.post('/', crearUsuario)
router.put('/:id', actualizarUsuario)
router.post('/:id/convertir-real', convertirUsuarioReal)
router.delete('/:id', eliminarUsuario)

export default router
