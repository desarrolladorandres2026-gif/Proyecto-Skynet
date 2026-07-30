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

const router = safeRouter()

router.use(verificarToken, requiereModuloActivo('danos'))

// Reportar y consultar lo propio: capacidad universal de todo usuario
// autenticado, por diseño (no es un permiso RBAC — ver seedData/rbac.data.js).
router.post('/', uploadFoto.single('foto'), crearReporte)
router.get('/mios', misReportes)

// Gestión: mantenimiento / administrador (super admin pasa por esSuperAdmin).
// Las rutas literales van ANTES de '/:id' o Express haría match de "tecnicos"
// como si fuera un id.
router.get('/', requierePermiso('danos:gestionar'), listarReportes)
router.get('/tecnicos', requierePermiso('danos:gestionar'), listarTecnicos)
router.get('/:id', requierePermiso('danos:gestionar'), detalleReporte)

// Asignar y cambiar estado comparten el permiso de entrada, pero el service
// afina quién puede hacer qué: auto-asignarse lo puede cualquiera del equipo,
// asignarle a OTRO exige mantenimiento:asignar, y el estado solo lo mueve el
// técnico asignado o un supervisor.
router.patch('/:id/asignar', requierePermiso('danos:gestionar'), asignarReporte)
router.patch('/:id/estado', requierePermiso('danos:gestionar'), cambiarEstado)

// Borrar es irreversible (se lleva la foto de Cloudinary con él): se reserva a
// quien supervisa. El personal de mantenimiento cancela en vez de eliminar.
router.delete('/:id', requierePermiso('mantenimiento:asignar'), eliminarReporte)

export default router
