import { verificarToken } from '../../middleware/auth.js'
import { requierePermiso } from '../../middleware/permisos.js'
import { safeRouter } from '../../middleware/safeRouter.js'
import {
  transmitirAviso,
  obtenerOpcionesDestinatarios,
  buscarUsuarios,
  obtenerHistorial,
  obtenerAvisoDetalle,
  obtenerPendientes,
  obtenerMisAvisos,
  confirmarEstadoEntrega,
  obtenerAudioAviso,
  probarVoz,
} from './avisos.controller.js'

const router = safeRouter()

router.use(verificarToken)

// Universal para cualquier autenticado: recibir avisos institucionales y
// consultar el propio historial no es un permiso (mismo criterio que
// "reportar un daño" — ver rbac.data.js), es la mitad "destinatario" del
// flujo. Ninguna de estas rutas acepta un usuarioId externo: siempre operan
// sobre req.usuario.id_usuario.
router.get('/pendientes', obtenerPendientes)
router.get('/mias', obtenerMisAvisos)
router.put('/entregas/:id/estado', confirmarEstadoEntrega)

// Audio institucional de un aviso: universal también, pero NO por
// requierePermiso — la autorización es condicional (propia entrega O
// permiso de transmitir/ver_historial) y vive dentro de
// obtenerAudioParaUsuario() en avisos.service.js, mismo criterio que
// actualizarEstadoEntrega.
router.get('/:id/audio', obtenerAudioAviso)

// Transmitir es exclusivo de quien tenga el permiso — ver seedData/rbac.data.js
// (avisos_terminal:transmitir, asignado a Administrador/Dir. Administrativo y
// Gestión/Comunicador; Super Admin bypassa por esSuperAdmin).
router.get('/destinatarios/opciones', requierePermiso('avisos_terminal:transmitir'), obtenerOpcionesDestinatarios)
router.get('/destinatarios/usuarios', requierePermiso('avisos_terminal:transmitir'), buscarUsuarios)
router.post('/voz/probar', requierePermiso('avisos_terminal:transmitir'), probarVoz)
router.post('/', requierePermiso('avisos_terminal:transmitir'), transmitirAviso)

// Historial administrativo: transmitir ya implica poder verlo; ver_historial
// existe aparte por si se delega solo consulta a otro rol más adelante
// (mismo criterio que notificaciones:ver_historial).
// requierePermiso(...codigos) es un rest-parameter (ver middleware/permisos.js):
// hay que pasar los códigos como argumentos separados, NUNCA como un array —
// requierePermiso(['a','b']) compila pero queda siempre en false (Set.has()
// nunca encuentra un array dentro del Set de strings), bloqueando estas dos
// rutas para cualquiera que no sea esSuperAdmin.
router.get('/', requierePermiso('avisos_terminal:transmitir', 'avisos_terminal:ver_historial'), obtenerHistorial)
router.get('/:id', requierePermiso('avisos_terminal:transmitir', 'avisos_terminal:ver_historial'), obtenerAvisoDetalle)

export default router
