import { verificarToken } from '../../middleware/auth.js'
import { requiereModuloActivo } from '../../middleware/moduloActivo.js'
import { safeRouter } from '../../middleware/safeRouter.js'
import { preguntaDelDia, responder, misHistorial, miProgreso } from './sig-respuestas.controller.js'

// Ver la pregunta del día, responderla y consultar el propio progreso son
// capacidad universal de cualquier trabajador autenticado — mismo principio
// que "reportar un daño" (modules/danos): solo verificarToken, sin permiso
// RBAC. Cada persona solo puede ver/responder lo suyo porque el service
// siempre resuelve a partir de req.usuario.id_usuario, nunca de un id que
// venga en la URL o el body.
const router = safeRouter()

router.use(verificarToken, requiereModuloActivo('sig_pregunta_dia'))

router.get('/pregunta-del-dia', preguntaDelDia)
router.post('/programacion/:id/responder', responder)
router.get('/mi-historial', misHistorial)
router.get('/mi-progreso', miProgreso)

export default router
