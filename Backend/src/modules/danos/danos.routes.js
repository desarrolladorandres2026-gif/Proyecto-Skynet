import multer from 'multer'
import { verificarToken } from '../../middleware/auth.js'
import { requierePermiso } from '../../middleware/permisos.js'
import { requiereModuloActivo } from '../../middleware/moduloActivo.js'
import { safeRouter } from '../../middleware/safeRouter.js'
import {
  crearReporte,
  misReportes,
  listarReportes,
  detalleReporte,
  listarTecnicos,
  asignarReporte,
  cambiarEstado,
  eliminarReporte,
} from './danos.controller.js'

// memoryStorage (no disco): el buffer va directo a Cloudinary, no se persiste
// nada localmente. Límite 10 MB, solo imágenes.
const uploadFoto = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) return cb(null, true)
    cb(new Error('Solo se permiten imágenes'))
  },
})

// Evidencia de reparación (hasta 5 fotos): mismo criterio que uploadFoto
// (memoria, directo a Cloudinary), pero .array() porque "Reparado" puede
// llevar más de una foto (antes/después).
const uploadEvidenciasReparacion = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) return cb(null, true)
    cb(new Error('Solo se permiten imágenes'))
  },
})

const router = safeRouter()

router.use(verificarToken, requiereModuloActivo('danos'))

// Reportar y consultar lo propio: capacidad universal de todo usuario
// autenticado, por diseño (no es un permiso RBAC — ver seedData/rbac.data.js).
// crearReporte además bloquea al personal de mantenimiento puro (ver
// esTecnicoPuro en el controller): reportar no es su función.
router.post('/', uploadFoto.single('foto'), crearReporte)
router.get('/mios', misReportes)

// Gestión: mantenimiento (solo lo suyo) / administrador (todo, super admin
// pasa por esSuperAdmin). Las rutas literales van ANTES de '/:id' o Express
// haría match de "tecnicos" como si fuera un id. El service (listarReportes/
// obtenerReporte) recorta el resultado a "solo lo mío" cuando el actor no
// tiene danos:gestionar — ver puedeVerTodo().
router.get('/', requierePermiso('danos:gestionar', 'mantenimiento:ejecutar'), listarReportes)
// El equipo completo con su carga de trabajo es información de supervisión:
// un técnico no necesita (ni debe) ver cuánto tienen encima sus compañeros.
router.get('/tecnicos', requierePermiso('danos:gestionar'), listarTecnicos)
router.get('/:id', requierePermiso('danos:gestionar', 'mantenimiento:ejecutar'), detalleReporte)

// Asignar (repartir o reasignar trabajo) es exclusivo de supervisión: el
// técnico ya no puede ni auto-asignarse (la asignación es automática o la
// hace un supervisor a mano — ver danos.service.js).
router.patch('/:id/asignar', requierePermiso('danos:gestionar'), asignarReporte)
// Cambiar el estado de LO SUYO sí lo puede hacer el técnico; el service exige
// que sea el asignado (o un supervisor) y bloquea volver a 'pendiente'
// (liberar/reasignar) para quien no supervisa.
router.patch(
  '/:id/estado',
  requierePermiso('danos:gestionar', 'mantenimiento:ejecutar'),
  uploadEvidenciasReparacion.array('evidencias', 5),
  cambiarEstado
)

// Borrar es irreversible (se lleva la foto de Cloudinary con él): se reserva a
// quien supervisa. El personal de mantenimiento cancela en vez de eliminar.
router.delete('/:id', requierePermiso('mantenimiento:asignar'), eliminarReporte)

export default router
