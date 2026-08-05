import { verificarToken } from '../../middleware/auth.js'
import { requiereModuloActivo } from '../../middleware/moduloActivo.js'
import { copilotoLimiter } from '../../middleware/rateLimit.js'
import { safeRouter } from '../../middleware/safeRouter.js'
import { chat } from './copiloto.controller.js'

// Copiloto de datos: chat de solo lectura sobre información PROPIA del
// usuario (ver copiloto.herramientas.js). Capacidad universal, igual que
// "Reportar daño" — cualquier usuario autenticado con el módulo activo puede
// usarlo, sin exigir un permiso RBAC puntual.
const router = safeRouter()

router.use(verificarToken, requiereModuloActivo('copiloto'))
router.post('/chat', copilotoLimiter, chat)

export default router
