import {
  obtenerEstadoPublico,
  obtenerEstadoAdmin,
  programar,
  editar,
  cancelar,
  activar,
  finalizar,
  historial,
} from './plataforma.controller.js'
import { verificarToken } from '../../middleware/auth.js'
import { requierePermiso } from '../../middleware/permisos.js'
import { safeRouter } from '../../middleware/safeRouter.js'
import { estadoLimiter } from '../../middleware/rateLimit.js'

const router = safeRouter()

// ── Ruta publica ────────────────────────────────────────────────────────────
// DEBE ir antes del router.use(verificarToken) de abajo: Express ejecuta los
// middleware en orden de registro, asi que declararla despues la dejaria
// exigiendo sesion — y entonces la pantalla de login no podria consultar el
// estado, que es justo el caso para el que existe.
//
// Lleva rate limit propio porque es el unico endpoint del sistema que
// responde sin autenticacion alguna y el frontend lo consulta por polling:
// sin limite es un amplificador gratuito para cualquiera con un bucle.
router.get('/estado', estadoLimiter, obtenerEstadoPublico)

// ── Rutas administrativas ───────────────────────────────────────────────────
// Siguen exactamente el mismo esquema que /sistema/modulos: sesion valida +
// permiso RBAC granular. El Super Admin las atraviesa por el bypass de
// esSuperAdmin que ya implementa requierePermiso.
router.use(verificarToken)

router.get('/admin', requierePermiso('plataforma:gestionar'), obtenerEstadoAdmin)
router.get('/historial', requierePermiso('plataforma:gestionar'), historial)
router.post('/programar', requierePermiso('plataforma:gestionar'), programar)
router.put('/programar', requierePermiso('plataforma:gestionar'), editar)
router.delete('/programar', requierePermiso('plataforma:gestionar'), cancelar)
router.post('/activar', requierePermiso('plataforma:gestionar'), activar)
router.post('/finalizar', requierePermiso('plataforma:gestionar'), finalizar)

export default router
