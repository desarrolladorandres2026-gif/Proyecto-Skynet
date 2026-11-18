import { obtener, cambiar } from './tematica.controller.js'
import { verificarToken } from '../../middleware/auth.js'
import { requierePermiso } from '../../middleware/permisos.js'
import { safeRouter } from '../../middleware/safeRouter.js'
import { estadoLimiter } from '../../middleware/rateLimit.js'

const router = safeRouter()

// PÚBLICA (sin sesión): la pantalla de login también lleva la temática, y se
// pinta antes de que exista sesión. Solo expone { modo } ('auto' | 'ninguna' |
// id de temática): nada sensible. Lleva el mismo rate limit que
// /plataforma/estado por ser un endpoint anónimo. DEBE ir antes del
// router.use(verificarToken) de abajo.
router.get('/', estadoLimiter, obtener)

// Cambiar: sesión + permiso 'tematica:gestionar' (Super Admin por bypass).
router.use(verificarToken)
router.put('/', requierePermiso('tematica:gestionar'), cambiar)

export default router
