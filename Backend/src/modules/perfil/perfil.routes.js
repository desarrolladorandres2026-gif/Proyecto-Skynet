import multer from 'multer'
import { verificarToken } from '../../middleware/auth.js'
import { safeRouter } from '../../middleware/safeRouter.js'
import { obtenerFirma, guardarFirma, eliminarFirma } from './perfil.controller.js'

// Mismo criterio que danos/ausencias: memoryStorage, el buffer va directo a
// Cloudinary. 5 MB alcanza de sobra para la foto de una firma (es un recorte
// de media hoja) y corta de entrada una foto de cámara sin comprimir.
const uploadFirma = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) return cb(null, true)
    cb(new Error('Solo se permiten imágenes'))
  },
})

const router = safeRouter()

// Sin requiereModuloActivo ni requierePermiso a propósito: la firma es un dato
// personal de cualquier usuario autenticado. Quién puede USARLA para firmar lo
// decide cada flujo con su propio permiso (requerimientos:aprobar_financiero).
router.use(verificarToken)

router.get('/firma', obtenerFirma)
router.put('/firma', uploadFirma.single('firma'), guardarFirma)
router.delete('/firma', eliminarFirma)

export default router
