import { verificarToken } from '../../middleware/auth.js'
import { requiereModuloActivo } from '../../middleware/moduloActivo.js'
import { copilotoLimiter } from '../../middleware/rateLimit.js'
import { safeRouter } from '../../middleware/safeRouter.js'
import { chat, confirmarRequerimientoCompra, confirmarAccion } from './copiloto.controller.js'

// Copiloto de datos: chat de solo lectura sobre información PROPIA del
// usuario (ver copiloto.herramientas.js). Capacidad universal, igual que
// "Reportar daño" — cualquier usuario autenticado con el módulo activo puede
// usarlo, sin exigir un permiso RBAC puntual.
const router = safeRouter()

router.use(verificarToken, requiereModuloActivo('copiloto'))
router.post('/chat', copilotoLimiter, chat)

// Confirma un borrador que el chat sugirió (ver copiloto.herramientas.js
// #preparar_requerimiento_compra). Exige AMBOS módulos activos: copiloto (por
// el router.use de arriba) y requerimientos — es la misma acción de negocio
// que crear uno desde el formulario normal, así que respeta el mismo
// interruptor de Sistema → Módulos que ese formulario.
router.post('/requerimientos/compra', requiereModuloActivo('requerimientos'), confirmarRequerimientoCompra)

// Dispara una acción que quedó esperando confirmación (ver copiloto.
// confirmaciones.js). No lleva `copilotoLimiter`: ese limitador existe para
// racionar la cuota de Gemini, y este camino no llama al modelo. Lo que sí
// aplica es el permiso de la herramienta, que se revalida al ejecutar dentro
// de `ejecutarConfirmada` — no aquí, porque depende de cuál sea la acción.
router.post('/confirmar', confirmarAccion)

export default router
