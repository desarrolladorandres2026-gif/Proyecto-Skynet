import { login, logout, me, solicitarReset, validarToken, restablecerPassword, cambiarPassword } from './auth.controller.js'
import { verificarToken } from '../../middleware/auth.js'
import { loginLimiter, resetLimiter } from '../../middleware/rateLimit.js'
import { safeRouter } from '../../middleware/safeRouter.js'

const router = safeRouter()

/**
 * @openapi
 * /auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Inicia sesión y deja el token en una cookie httpOnly
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [usuario, password]
 *             properties:
 *               usuario:
 *                 type: string
 *               password:
 *                 type: string
 *                 format: password
 *     responses:
 *       200:
 *         description: Login correcto
 *       401:
 *         description: Credenciales inválidas
 *       429:
 *         description: Demasiados intentos (rate limit)
 */
router.post('/login', loginLimiter, login)
// Sin rate limit ni auth: cerrar sesión debe funcionar siempre, incluso con un
// token ya inválido/expirado (solo borra la cookie del navegador).
/**
 * @openapi
 * /auth/logout:
 *   post:
 *     tags: [Auth]
 *     summary: Cierra sesión (borra la cookie del token)
 *     responses:
 *       200:
 *         description: Sesión cerrada
 */
router.post('/logout', logout)
/**
 * @openapi
 * /auth/me:
 *   get:
 *     tags: [Auth]
 *     summary: Devuelve el usuario autenticado actual
 *     security: [{ cookieAuth: [] }]
 *     responses:
 *       200:
 *         description: Usuario autenticado
 *       401:
 *         description: No autenticado
 */
router.get('/me', verificarToken, me)
/**
 * @openapi
 * /auth/cambiar-password:
 *   post:
 *     tags: [Auth]
 *     summary: Cambia la contraseña del usuario autenticado
 *     security: [{ cookieAuth: [] }]
 *     responses:
 *       200:
 *         description: Contraseña actualizada
 *       401:
 *         description: No autenticado o contraseña actual incorrecta
 */
router.post('/cambiar-password', verificarToken, cambiarPassword)

/**
 * @openapi
 * /auth/solicitar-reset:
 *   post:
 *     tags: [Auth]
 *     summary: Solicita el email de restablecimiento de contraseña
 *     responses:
 *       200:
 *         description: Mensaje genérico (no confirma si el usuario existe)
 *       429:
 *         description: Demasiados intentos (rate limit)
 */
router.post('/solicitar-reset', resetLimiter, solicitarReset)
/**
 * @openapi
 * /auth/validar-token:
 *   get:
 *     tags: [Auth]
 *     summary: Valida un token de restablecimiento de contraseña
 *     parameters:
 *       - in: query
 *         name: token
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Token válido
 *       400:
 *         description: Token inválido o expirado
 */
router.get('/validar-token', resetLimiter, validarToken)
/**
 * @openapi
 * /auth/restablecer-password:
 *   post:
 *     tags: [Auth]
 *     summary: Restablece la contraseña usando un token válido
 *     responses:
 *       200:
 *         description: Contraseña restablecida
 *       400:
 *         description: Token inválido o expirado
 */
router.post('/restablecer-password', resetLimiter, restablecerPassword)

export default router
