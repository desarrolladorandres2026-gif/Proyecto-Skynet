import {
  buscarUsuarios,
  listarUsuarios,
  crearUsuario,
  actualizarUsuario,
  convertirUsuarioReal,
  eliminarUsuario,
} from './usuarios.controller.js'
import { verificarToken, soloAdmin } from '../../middleware/auth.js'
import { safeRouter } from '../../middleware/safeRouter.js'

const router = safeRouter()

router.use(verificarToken, soloAdmin)

router.get('/buscar', buscarUsuarios)
router.get('/', listarUsuarios)
router.post('/', crearUsuario)
router.put('/:id', actualizarUsuario)
router.post('/:id/convertir-real', convertirUsuarioReal)
router.delete('/:id', eliminarUsuario)

export default router
