import multer from 'multer'
import { verificarToken } from '../../middleware/auth.js'
import { requierePermiso } from '../../middleware/permisos.js'
import { requiereModuloActivo } from '../../middleware/moduloActivo.js'
import { safeRouter } from '../../middleware/safeRouter.js'
import {
  crearReporte,
  misReportes,
  listarReportes,
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
router.get('/', requierePermiso('danos:gestionar'), listarReportes)
router.patch('/:id/estado', requierePermiso('danos:gestionar'), cambiarEstado)
router.delete('/:id', requierePermiso('danos:gestionar'), eliminarReporte)

export default router
