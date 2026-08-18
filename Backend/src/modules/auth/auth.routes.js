import { login, logout, me, solicitarReset, validarToken, restablecerPassword, cambiarPassword } from './auth.controller.js'
import { verificarToken } from '../../middleware/auth.js'
import { loginLimiter, resetLimiter } from '../../middleware/rateLimit.js'
import { safeRouter } from '../../middleware/safeRouter.js'

const router = safeRouter()

router.post('/login', loginLimiter, login)
// Sin rate limit ni auth: cerrar sesión debe funcionar siempre, incluso con un
// token ya inválido/expirado (solo borra la cookie del navegador).
router.post('/logout', logout)
router.get('/me', verificarToken, me)
router.post('/cambiar-password', verificarToken, cambiarPassword)

router.post('/solicitar-reset', resetLimiter, solicitarReset)
router.get('/validar-token', resetLimiter, validarToken)
router.post('/restablecer-password', resetLimiter, restablecerPassword)

export default router
