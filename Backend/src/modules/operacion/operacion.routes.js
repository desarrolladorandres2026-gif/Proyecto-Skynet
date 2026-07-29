import { verificarToken } from '../../middleware/auth.js'
import { requierePermiso, cargarScopeEmpresa } from '../../middleware/permisos.js'
import { requiereModuloActivo } from '../../middleware/moduloActivo.js'
import { safeRouter } from '../../middleware/safeRouter.js'
import { listarRutas, crearRuta, actualizarRuta, eliminarRuta } from './rutas.controller.js'
import { listarHorarios, crearHorario, actualizarHorario, eliminarHorario } from './horarios.controller.js'
import { listarDespachos, registrarSalida, registrarLlegada, registrarRetraso } from './despachos.controller.js'
import { listarNovedades, crearNovedad, cerrarNovedad } from './novedades.controller.js'
import { listarObjetos, registrarObjeto, entregarObjeto } from './objetosPerdidos.controller.js'
import { resumenDashboard } from './dashboard.controller.js'

const router = safeRouter()

router.use(verificarToken, cargarScopeEmpresa)

// Dashboard: universal — cada rol recibe solo las tarjetas de sus permisos.
router.get('/dashboard', resumenDashboard)

// El gate de módulo desactivado va por PREFIJO y no sobre todo el router:
// /dashboard vive aquí pero pertenece al núcleo del sistema (es la home de
// todos los roles) y debe seguir respondiendo con "operacion" apagado.
const gateOperacion = requiereModuloActivo('operacion')
router.use('/rutas', gateOperacion)
router.use('/horarios', gateOperacion)
router.use('/despachos', gateOperacion)
router.use('/novedades', gateOperacion)
router.use('/objetos-perdidos', gateOperacion)

// Rutas: catálogo global; lo consultan también horarios y despachos.
router.get('/rutas', requierePermiso('rutas:gestionar', 'horarios:gestionar', 'horarios:ver_programacion', 'despachos:registrar_salida'), listarRutas)
router.post('/rutas', requierePermiso('rutas:gestionar'), crearRuta)
router.put('/rutas/:id', requierePermiso('rutas:gestionar'), actualizarRuta)
router.delete('/rutas/:id', requierePermiso('rutas:gestionar'), eliminarRuta)

// Horarios: gestionar (admin / empresa scoped) o solo ver programación (despachador).
router.get('/horarios', requierePermiso('horarios:gestionar', 'horarios:ver_programacion'), listarHorarios)
router.post('/horarios', requierePermiso('horarios:gestionar'), crearHorario)
router.put('/horarios/:id', requierePermiso('horarios:gestionar'), actualizarHorario)
router.delete('/horarios/:id', requierePermiso('horarios:gestionar'), eliminarHorario)

// Despachos: la función central del Despachador. El listado también lo ven
// reportes:ver (admin) y empresas:ver_estadisticas (empresa, scoped).
router.get('/despachos', requierePermiso('despachos:registrar_salida', 'despachos:registrar_llegada', 'reportes:ver', 'empresas:ver_estadisticas'), listarDespachos)
router.post('/despachos/salida', requierePermiso('despachos:registrar_salida'), registrarSalida)
router.patch('/despachos/:id/llegada', requierePermiso('despachos:registrar_llegada'), registrarLlegada)
router.patch('/despachos/:id/retraso', requierePermiso('despachos:registrar_retraso'), registrarRetraso)

// Novedades: registrar (varios roles); el filtro incidente/historial es por
// permiso dentro del controller.
router.get('/novedades', requierePermiso('novedades:registrar', 'novedades:registrar_incidente', 'novedades:consultar_historial'), listarNovedades)
router.post('/novedades', requierePermiso('novedades:registrar', 'novedades:registrar_incidente'), crearNovedad)
router.patch('/novedades/:id/cerrar', requierePermiso('novedades:consultar_historial', 'novedades:registrar_incidente'), cerrarNovedad)

// Objetos perdidos: Seguridad registra el hallazgo, Operador gestiona la entrega.
router.get('/objetos-perdidos', requierePermiso('objetos_perdidos:registrar', 'objetos_perdidos:gestionar'), listarObjetos)
router.post('/objetos-perdidos', requierePermiso('objetos_perdidos:registrar', 'objetos_perdidos:gestionar'), registrarObjeto)
router.patch('/objetos-perdidos/:id/entregar', requierePermiso('objetos_perdidos:gestionar'), entregarObjeto)

export default router
