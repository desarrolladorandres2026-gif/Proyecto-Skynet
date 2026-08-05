import { verificarToken } from '../../middleware/auth.js'
import { requierePermiso } from '../../middleware/permisos.js'
import { requiereModuloActivo } from '../../middleware/moduloActivo.js'
import { safeRouter } from '../../middleware/safeRouter.js'
import { uploadEvidencia } from './evidencias.upload.js'
import {
  reportar, programar, listar, tecnicos, detalle, asignar, aceptar, rechazar,
  pausar, reanudar, resolver, aprobar, rechazarCierre, reabrir, cancelar, escalar,
} from './ordenes.controller.js'
import {
  llegada, inspeccion, diagnostico, material, herramienta, horas, evidencia,
  solicitarRepuestos, aprobarRepuestos, rechazarRepuestos, entregarRepuestos, instalarRepuestos,
  invitarApoyo, aceptarApoyo, rechazarApoyo,
} from './tecnico.controller.js'
import {
  registrar as registrarHallazgo, listarDeOrden as listarHallazgos, evidencia as evidenciaHallazgo,
  seguimiento as seguimientoHallazgo, resolver as resolverHallazgo, aceptarRiesgo, convertir as convertirHallazgo,
} from './hallazgos.controller.js'
import { agregar as agregarBitacora, listar as listarBitacora } from './bitacora.controller.js'
import {
  crear as crearPlantilla, listar as listarPlantillas, actualizar as actualizarPlantilla, desactivar as desactivarPlantilla,
  aplicar as aplicarPlantilla, marcarItem as marcarItemChecklist,
} from './plantillas.controller.js'
import {
  buscar as buscarMateriales, crear as crearMaterial, ajustar as ajustarStock,
  consumir as consumirInventario, devolver as devolverInventario, desperdicio as desperdicioInventario,
} from './inventario.controller.js'
import { convertir as convertirConocimiento, buscar as buscarConocimiento, vincular as vincularConocimiento, curar as curarConocimiento } from './conocimiento.controller.js'
import { enviar as enviarMensaje, listar as listarMensajes } from './mensajes.controller.js'
import { seguimiento as seguimientoTecnicos } from './seguimiento.controller.js'
import { indicadores as indicadoresPersonales } from './indicadores.controller.js'
import {
  centroControl, sugerirTecnico, balanceCarga, reasignar, reasignarLote, centroAprobaciones,
  calendario, centroSLA, centroHallazgos, fichaActivo, actualizarActivo, activosProblematicos,
  alertas, dashboardGerencial,
} from './supervisor.controller.js'

// Router propio para el ciclo de vida de la Orden de Trabajo (CMMS Fase 1),
// montado en /mantenimiento/ordenes por separado del router legado
// (mantenimiento.routes.js), que sigue detrás de requireModulo('mantenimiento')
// (RBAC binario). Aquí se usa el RBAC granular nuevo: verificarToken +
// requiereModuloActivo dejan pasar a cualquier autenticado (reportar un
// problema es universal, igual que "Reportar daño" en modules/danos), y cada
// acción de gestión exige su propio permiso puntual.
const router = safeRouter()

router.use(verificarToken, requiereModuloActivo('mantenimiento'))

router.post('/', reportar)
router.get('/', listar)
// Rutas literales antes de '/:id': si no, Express las trataría como un id.
router.get('/tecnicos', requierePermiso('mantenimiento:asignar'), tecnicos)
router.get('/seguimiento', seguimientoTecnicos)
router.get('/indicadores', indicadoresPersonales)
router.get('/plantillas', listarPlantillas)
router.get('/conocimiento', buscarConocimiento)
router.get('/inventario/materiales', buscarMateriales)
router.get('/:id', detalle)

router.post('/programar', requierePermiso('mantenimiento:asignar'), programar)
router.post('/:id/asignar', requierePermiso('mantenimiento:asignar'), asignar)
router.get('/:id/sugerir-tecnico', requierePermiso('mantenimiento:asignar'), sugerirTecnico)
router.post('/:id/reasignar', requierePermiso('mantenimiento:asignar'), reasignar)
router.post('/:id/aceptar', requierePermiso('mantenimiento:ejecutar'), aceptar)
router.post('/:id/rechazar', requierePermiso('mantenimiento:ejecutar'), rechazar)
router.post('/:id/pausar', requierePermiso('mantenimiento:ejecutar'), pausar)
router.post('/:id/reanudar', requierePermiso('mantenimiento:ejecutar'), reanudar)
// Foto opcional (ver resolverOrden): mismo multer de evidencias, campo 'foto'.
router.post('/:id/resolver', requierePermiso('mantenimiento:ejecutar'), uploadEvidencia.single('foto'), resolver)
router.post('/:id/aprobar', requierePermiso('mantenimiento:aprobar_cerrar'), aprobar)
router.post('/:id/rechazar_cierre', requierePermiso('mantenimiento:aprobar_cerrar'), rechazarCierre)
router.post('/:id/reabrir', requierePermiso('mantenimiento:reabrir'), reabrir)
router.post('/:id/cancelar', requierePermiso('mantenimiento:cancelar'), cancelar)
router.post('/:id/escalar', requierePermiso('mantenimiento:ejecutar', 'mantenimiento:escalar'), escalar)

// ── Ejecución técnica (CMMS Fase 3) ─────────────────────────────────────────
router.post('/:id/llegada', requierePermiso('mantenimiento:ejecutar'), uploadEvidencia.single('foto'), llegada)
router.post('/:id/inspeccion', requierePermiso('mantenimiento:ejecutar'), inspeccion)
router.post('/:id/diagnostico', requierePermiso('mantenimiento:ejecutar'), diagnostico)
router.post('/:id/materiales', requierePermiso('mantenimiento:ejecutar'), material)
router.post('/:id/herramientas', requierePermiso('mantenimiento:ejecutar'), herramienta)
router.post('/:id/horas', requierePermiso('mantenimiento:ejecutar'), horas)
router.post('/:id/evidencias', requierePermiso('mantenimiento:ejecutar'), uploadEvidencia.single('archivo'), evidencia)

// Sub-flujo de repuestos: solicitado -> aprobado/rechazado -> entregado -> instalado
router.post('/:id/repuestos', requierePermiso('mantenimiento:ejecutar'), solicitarRepuestos)
router.post('/:id/repuestos/:solicitudId/aprobar', requierePermiso('mantenimiento:aprobar_repuestos'), aprobarRepuestos)
router.post('/:id/repuestos/:solicitudId/rechazar', requierePermiso('mantenimiento:aprobar_repuestos'), rechazarRepuestos)
router.post('/:id/repuestos/:solicitudId/entregar', requierePermiso('mantenimiento:aprobar_repuestos'), entregarRepuestos)
router.post('/:id/repuestos/:solicitudId/instalar', requierePermiso('mantenimiento:ejecutar'), instalarRepuestos)

// Apoyo entre técnicos: invitar (solo el asignado) / aceptar / rechazar (solo el invitado)
router.post('/:id/apoyo', requierePermiso('mantenimiento:ejecutar'), invitarApoyo)
router.post('/:id/apoyo/:invitacionId/aceptar', requierePermiso('mantenimiento:ejecutar'), aceptarApoyo)
router.post('/:id/apoyo/:invitacionId/rechazar', requierePermiso('mantenimiento:ejecutar'), rechazarApoyo)

// Hallazgos: registrados en el contexto de una OT; acciones posteriores por su propio id.
router.post('/:id/hallazgos', requierePermiso('mantenimiento:ejecutar'), registrarHallazgo)
router.get('/:id/hallazgos', listarHallazgos)
router.post('/hallazgos/:hallazgoId/evidencias', requierePermiso('mantenimiento:ejecutar'), uploadEvidencia.single('archivo'), evidenciaHallazgo)
router.post('/hallazgos/:hallazgoId/seguimiento', requierePermiso('mantenimiento:ejecutar'), seguimientoHallazgo)
router.post('/hallazgos/:hallazgoId/resolver', requierePermiso('mantenimiento:ejecutar'), resolverHallazgo)
router.post('/hallazgos/:hallazgoId/aceptar_riesgo', requierePermiso('mantenimiento:asignar'), aceptarRiesgo)
router.post('/hallazgos/:hallazgoId/convertir', requierePermiso('mantenimiento:ejecutar'), convertirHallazgo)

// ── Fase 3.1 ─────────────────────────────────────────────────────────────

// Bitácora Operativa (Work Log): independiente del Timeline de transiciones.
router.post('/:id/bitacora', requierePermiso('mantenimiento:ejecutar'), uploadEvidencia.single('adjunto'), agregarBitacora)
router.get('/:id/bitacora', requierePermiso('mantenimiento:ejecutar', 'mantenimiento:ver_todas'), listarBitacora)

// Checklists Inteligentes / Plantillas de Mantenimiento (mismo catálogo).
router.post('/plantillas', requierePermiso('mantenimiento:gestionar_plantillas'), crearPlantilla)
router.post('/plantillas/:plantillaId', requierePermiso('mantenimiento:gestionar_plantillas'), actualizarPlantilla)
router.post('/plantillas/:plantillaId/desactivar', requierePermiso('mantenimiento:gestionar_plantillas'), desactivarPlantilla)
router.post('/:id/plantilla', requierePermiso('mantenimiento:ejecutar'), aplicarPlantilla)
router.post('/:id/checklist/:itemId', requierePermiso('mantenimiento:ejecutar'), marcarItemChecklist)

// Inventario: catálogo de materiales + movimientos ligados a una OT.
router.post('/inventario/materiales', requierePermiso('mantenimiento:gestionar_inventario'), crearMaterial)
router.post('/inventario/materiales/:materialId/ajustar', requierePermiso('mantenimiento:gestionar_inventario'), ajustarStock)
router.post('/:id/inventario/consumir', requierePermiso('mantenimiento:ejecutar'), consumirInventario)
router.post('/:id/inventario/devolver', requierePermiso('mantenimiento:ejecutar'), devolverInventario)
router.post('/:id/inventario/desperdicio', requierePermiso('mantenimiento:ejecutar'), desperdicioInventario)

// Base de Conocimiento.
router.post('/:id/conocimiento', requierePermiso('mantenimiento:ejecutar'), convertirConocimiento)
router.post('/conocimiento/:articuloId/vincular', requierePermiso('mantenimiento:ejecutar'), vincularConocimiento)
router.post('/conocimiento/:articuloId/curar', requierePermiso('mantenimiento:gestionar_conocimiento'), curarConocimiento)

// Comunicación interna (canales 'interno' / 'solicitante', validados en el service).
router.post('/:id/mensajes', enviarMensaje)
router.get('/:id/mensajes', listarMensajes)

// ── Fase 4: módulo del Supervisor ────────────────────────────────────────
// Prefijo /supervisor/ para no colisionar con ningún /:id/<literal> ya
// registrado arriba (todas estas rutas tienen 2+ segmentos con 'supervisor'
// como primer segmento literal, nunca confundible con un ObjectId).
router.get('/supervisor/centro-control', requierePermiso('mantenimiento:ver_todas'), centroControl)
router.get('/supervisor/balance-carga', requierePermiso('mantenimiento:ver_todas'), balanceCarga)
router.post('/supervisor/reasignar-lote', requierePermiso('mantenimiento:asignar'), reasignarLote)
router.get('/supervisor/aprobaciones', requierePermiso('mantenimiento:ver_todas'), centroAprobaciones)
router.get('/supervisor/calendario', requierePermiso('mantenimiento:ver_todas'), calendario)
router.get('/supervisor/sla', requierePermiso('mantenimiento:ver_todas'), centroSLA)
router.get('/supervisor/centro-hallazgos', requierePermiso('mantenimiento:ver_todas'), centroHallazgos)
router.get('/supervisor/activos-problematicos', requierePermiso('mantenimiento:ver_todas'), activosProblematicos)
router.get('/supervisor/activos/:equipoId', requierePermiso('mantenimiento:ver_todas'), fichaActivo)
router.post('/supervisor/activos/:equipoId', requierePermiso('mantenimiento:gestionar_activos_criticidad'), actualizarActivo)
router.get('/supervisor/alertas', requierePermiso('mantenimiento:ver_todas'), alertas)
router.get('/supervisor/dashboard', requierePermiso('mantenimiento:ver_todas'), dashboardGerencial)

export default router
